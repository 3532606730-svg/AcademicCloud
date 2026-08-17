export interface BackupRetentionCandidate {
  name: string;
  createdAt: string;
  sha256: string;
  verified: boolean;
  lastKnownGood?: boolean;
}

export type BackupRetentionAction = "keep" | "eligible" | "hold";

export interface BackupRetentionDecision extends BackupRetentionCandidate {
  action: BackupRetentionAction;
  reasons: string[];
}

export interface BackupRetentionPlan {
  dryRun: true;
  policy: {
    daily: 7;
    weekly: 4;
    monthly: 6;
    futureSkewMinutes: 5;
  };
  now: string;
  decisions: BackupRetentionDecision[];
}

interface ValidCandidate extends BackupRetentionCandidate {
  time: number;
}

export function planBackupRetention(
  candidates: readonly BackupRetentionCandidate[],
  now: Date,
): BackupRetentionPlan {
  if (!Number.isFinite(now.getTime())) throw new Error("retention now is invalid");

  const nameCounts = new Map<string, number>();
  for (const candidate of candidates) {
    nameCounts.set(candidate.name, (nameCounts.get(candidate.name) ?? 0) + 1);
  }

  const decisions = new Map<BackupRetentionCandidate, { action: BackupRetentionAction; reasons: Set<string> }>();
  const valid: ValidCandidate[] = [];
  const futureSkewMilliseconds = 5 * 60 * 1_000;

  for (const candidate of candidates) {
    const decision = { action: "hold" as BackupRetentionAction, reasons: new Set<string>() };
    decisions.set(candidate, decision);

    if (!validName(candidate.name)) decision.reasons.add("invalid-name");
    if ((nameCounts.get(candidate.name) ?? 0) > 1) decision.reasons.add("duplicate-name");
    if (!/^[0-9a-f]{64}$/.test(candidate.sha256)) decision.reasons.add("invalid-sha256");
    if (!candidate.verified) decision.reasons.add("unverified");

    const created = new Date(candidate.createdAt);
    if (!Number.isFinite(created.getTime()) || created.toISOString() !== candidate.createdAt) {
      decision.reasons.add("invalid-created-at");
    } else if (created.getTime() > now.getTime() + futureSkewMilliseconds) {
      decision.reasons.add("future-created-at");
    }

    if (decision.reasons.size === 0) {
      valid.push({ ...candidate, time: created.getTime() });
    }
  }

  valid.sort(compareCandidates);
  const keepReasons = new Map<string, Set<string>>();
  const addKeepReason = (candidate: ValidCandidate, reason: string) => {
    const key = candidateIdentity(candidate);
    const reasons = keepReasons.get(key) ?? new Set<string>();
    reasons.add(reason);
    keepReasons.set(key, reasons);
  };

  if (valid[0]) addKeepReason(valid[0], "newest-verified");
  for (const candidate of valid) {
    if (candidate.lastKnownGood === true) addKeepReason(candidate, "last-known-good");
  }

  selectBuckets(valid, now, "daily", 7, dayBucket, addKeepReason);
  selectBuckets(valid, now, "weekly", 4, isoWeekBucket, addKeepReason);
  selectBuckets(valid, now, "monthly", 6, monthBucket, addKeepReason);

  for (const candidate of valid) {
    const decision = decisions.get(findOriginal(candidates, candidate));
    if (!decision) throw new Error("retention planner lost a candidate");
    const reasons = keepReasons.get(candidateIdentity(candidate));
    if (reasons) {
      decision.action = "keep";
      for (const reason of reasons) decision.reasons.add(reason);
    } else {
      decision.action = "eligible";
      decision.reasons.add("outside-retained-buckets");
    }
  }

  const ordered = [...candidates]
    .sort((left, right) => compareOutput(left, right))
    .map((candidate) => {
      const decision = decisions.get(candidate)!;
      return {
        ...candidate,
        // Canonicalize the optional input state so semantically equivalent
        // omitted/false records cannot preserve caller order in JSON output.
        lastKnownGood: candidate.lastKnownGood === true,
        action: decision.action,
        reasons: [...decision.reasons].sort(),
      };
    });

  return {
    dryRun: true,
    policy: { daily: 7, weekly: 4, monthly: 6, futureSkewMinutes: 5 },
    now: now.toISOString(),
    decisions: ordered,
  };
}

function selectBuckets(
  candidates: readonly ValidCandidate[],
  now: Date,
  tier: "daily" | "weekly" | "monthly",
  count: number,
  bucketOf: (date: Date) => number,
  keep: (candidate: ValidCandidate, reason: string) => void,
): void {
  const currentBucket = bucketOf(now);
  const selected = new Set<number>();
  for (const candidate of candidates) {
    const bucket = bucketOf(new Date(candidate.time));
    const distance = tier === "monthly"
      ? currentBucket - bucket
      : Math.floor((currentBucket - bucket) / (tier === "daily" ? 86_400_000 : 7 * 86_400_000));
    if (distance < 0 || distance >= count || selected.has(bucket)) continue;
    selected.add(bucket);
    keep(candidate, `${tier}-bucket-${distance}`);
  }
}

function dayBucket(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isoWeekBucket(date: Date): number {
  const day = dayBucket(date);
  const weekday = new Date(day).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return day - daysSinceMonday * 86_400_000;
}

function monthBucket(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function compareCandidates(left: ValidCandidate, right: ValidCandidate): number {
  return right.time - left.time
    || left.sha256.localeCompare(right.sha256, "en")
    || left.name.localeCompare(right.name, "en")
    || compareBoolean(left.verified, right.verified)
    || compareBoolean(left.lastKnownGood === true, right.lastKnownGood === true);
}

function compareOutput(left: BackupRetentionCandidate, right: BackupRetentionCandidate): number {
  const leftTime = new Date(left.createdAt).getTime();
  const rightTime = new Date(right.createdAt).getTime();
  const safeLeft = Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY;
  const safeRight = Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY;
  return safeRight - safeLeft
    || left.sha256.localeCompare(right.sha256, "en")
    || left.name.localeCompare(right.name, "en")
    || left.createdAt.localeCompare(right.createdAt, "en")
    || compareBoolean(left.verified, right.verified)
    || compareBoolean(left.lastKnownGood === true, right.lastKnownGood === true);
}

function compareBoolean(left: boolean, right: boolean): number {
  return Number(left) - Number(right);
}

function candidateIdentity(candidate: BackupRetentionCandidate): string {
  return `${candidate.name}\0${candidate.createdAt}\0${candidate.sha256}`;
}

function findOriginal(
  candidates: readonly BackupRetentionCandidate[],
  candidate: BackupRetentionCandidate,
): BackupRetentionCandidate {
  const identity = candidateIdentity(candidate);
  const original = candidates.find((item) => candidateIdentity(item) === identity);
  if (!original) throw new Error("retention candidate identity is missing");
  return original;
}

function validName(name: string): boolean {
  return Boolean(name)
    && name.length <= 255
    && !name.includes("\0")
    && !name.includes("/")
    && !name.includes("\\")
    && name !== "."
    && name !== "..";
}
