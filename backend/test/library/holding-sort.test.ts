import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import type { AuthenticatedAccount } from "../../src/auth/auth-service.js";
import { DriveService } from "../../src/drive/drive-service.js";
import { HoldingSortError, type HoldingSortCursor } from "../../src/library/holding-sort.js";
import { LibraryError, LibraryService } from "../../src/library/library-service.js";
import { pinyinSortKey } from "../../src/library/pinyin.js";
import { InMemoryStorageAdapter } from "../../src/storage/in-memory-storage-adapter.js";
import { createTestPersistence } from "../persistence/helpers.js";

const NOW = new Date("2026-08-21T08:00:00.000Z");
const OWNER: AuthenticatedAccount = { id: "sort-owner", loginName: "sort-owner", role: "owner" };
const MD5 = "1B2M2Y8AsgTpgAmY7PhCfg==";

interface HoldingSeed {
  id: string;
  displayName: string;
  sizeBytes: number;
  createdAt: string;
  canonicalTitle?: string | null;
  uploadedBy: string;
}

function seedHolding(database: ReturnType<typeof fixture>["database"], seed: HoldingSeed, domainId: string): void {
  const recordId = `${seed.id}-record`;
  const artifactId = `${seed.id}-artifact`;
  const versionId = `${seed.id}-version`;
  const timestamp = seed.createdAt;
  const objectKey = `objects/so/${seed.id.replace(/[^a-z0-9]/gi, "").padEnd(10, "a").slice(0, 10).padEnd(62, "x")}`;
  database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (?, ?, ?, NULL, ?, 'memory', ?, 'application/pdf', ?, 'md5', ?, 'active', 0, ?, ?, ?, NULL, NULL, NULL)
  `).run(seed.id, domainId, seed.uploadedBy, seed.displayName, objectKey, seed.sizeBytes, MD5, timestamp, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_records (id, owner_domain_id, created_by_account_id, label, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(recordId, domainId, seed.uploadedBy, seed.displayName, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifacts (id, owner_domain_id, record_id, attachment_state, created_at, updated_at)
    VALUES (?, ?, ?, 'detached', ?, ?)
  `).run(artifactId, domainId, recordId, timestamp, timestamp);
  database.prepare(`
    INSERT INTO scholarly_artifact_versions (id, owner_domain_id, artifact_id, stored_file_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(versionId, domainId, artifactId, seed.id, timestamp, timestamp);
  database.prepare("UPDATE scholarly_artifacts SET attachment_state = 'attached' WHERE id = ?").run(artifactId);
  if (seed.canonicalTitle) {
    database.prepare(`
      INSERT INTO scholarly_record_metadata (
        record_id, owner_domain_id, contract_version, material_type,
        canonical_title, subtitle, date_statement, created_by_account_id,
        updated_by_account_id, created_at, updated_at, revision
      ) VALUES (?, ?, 1, 'book', ?, NULL, NULL, ?, ?, ?, ?, 1)
    `).run(recordId, domainId, seed.canonicalTitle, seed.uploadedBy, seed.uploadedBy, timestamp, timestamp);
  }
}

function fixture(context: TestContext) {
  const { database, persistence } = createTestPersistence(context);
  persistence.repositories.accounts.create({
    id: OWNER.id,
    loginName: OWNER.loginName,
    passwordHash: "test",
    role: "owner",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  const storage = new InMemoryStorageAdapter(() => NOW);
  const drive = new DriveService(persistence, storage, () => NOW);
  const libraries = new LibraryService(persistence, drive, () => NOW, (() => {
    let next = 0;
    return () => `sort-lib-${++next}`;
  })());
  const library = persistence.repositories.libraries.findDefault()!;
  const seeds: HoldingSeed[] = [
    { id: "sort-hold-a", displayName: "元代宰相制度研究.pdf", sizeBytes: 40, createdAt: "2026-08-21T00:00:00.000Z", uploadedBy: OWNER.id },
    { id: "sort-hold-b", displayName: "圣武亲征录.pdf", sizeBytes: 10, createdAt: "2026-08-21T01:00:00.000Z", uploadedBy: OWNER.id },
    { id: "sort-hold-c", displayName: "The Mongols and the West.pdf", sizeBytes: 30, createdAt: "2026-08-21T02:00:00.000Z", uploadedBy: OWNER.id },
    { id: "sort-hold-d", displayName: "123数字文献.pdf", sizeBytes: 20, createdAt: "2026-08-21T03:00:00.000Z", uploadedBy: OWNER.id },
    { id: "sort-hold-e", displayName: "A-Z资源.pdf", sizeBytes: 50, createdAt: "2026-08-21T04:00:00.000Z", uploadedBy: OWNER.id },
    // The canonical title overrides the display name in title sorting.
    { id: "sort-hold-f", displayName: "zzz-unrelated.pdf", sizeBytes: 60, createdAt: "2026-08-21T05:00:00.000Z", canonicalTitle: "元代宰相制度研究（修订本）", uploadedBy: OWNER.id },
  ];
  for (const seed of seeds) seedHolding(database, seed, library.ownerDomainId);
  return { database, persistence, library, libraries, seeds };
}

function collectAll(service: LibraryService, accountId: string, libraryId: string, sort: "newest" | "oldest" | "title_asc" | "title_desc" | "size_desc" | "size_asc"): string[] {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard += 1) {
    const page = service.listHoldingsSorted(accountId, libraryId, sort, cursor, 2);
    ids.push(...page.holdings.map((holding) => holding.file.id));
    cursor = page.nextCursor;
    if (cursor === null) return ids;
  }
  throw new Error("pagination did not terminate");
}

test("pinyin sort keys normalize Han titles, drop punctuation, and keep digits/Latin deterministically", () => {
  assert.equal(pinyinSortKey("元代宰相制度研究"), "yuandaizaixiangzhiduyanjiu");
  assert.equal(pinyinSortKey("圣武亲征录"), "shengwuqinzhenglu");
  assert.equal(pinyinSortKey("《圣武亲征录》"), "shengwuqinzhenglu");
  assert.equal(pinyinSortKey("The Mongols and the West, 1221-1410"), "themongolsandthewest12211410");
  assert.equal(pinyinSortKey("123数字文献"), "123shuziwenxian");
  assert.equal(pinyinSortKey("元代宰相制度研究").toLowerCase(), pinyinSortKey("元代宰相制度研究"));
});

test("server-side sort orders are deterministic with stable pagination across every mode", (context) => {
  const { library, libraries } = fixture(context);
  const expectIds = (sort: "newest" | "oldest" | "title_asc" | "title_desc" | "size_desc" | "size_asc", expected: string[]) => {
    assert.deepEqual(collectAll(libraries, OWNER.id, library.id, sort), expected, sort);
  };
  // newest: artifact created_at DESC (f, e, d, c, b, a)
  expectIds("newest", ["sort-hold-f", "sort-hold-e", "sort-hold-d", "sort-hold-c", "sort-hold-b", "sort-hold-a"]);
  // oldest: ASC
  expectIds("oldest", ["sort-hold-a", "sort-hold-b", "sort-hold-c", "sort-hold-d", "sort-hold-e", "sort-hold-f"]);
  // title_asc (pinyin keys): 123数字文献 → A-Z资源 → 圣武亲征录(shengwu) → The Mongols(themongols)
  //   → 元代宰相制度研究.pdf(…yanjiupdf) → 修订本 via canonical title(…yanjiuxiudingben)
  expectIds("title_asc", ["sort-hold-d", "sort-hold-e", "sort-hold-b", "sort-hold-c", "sort-hold-a", "sort-hold-f"]);
  expectIds("title_desc", ["sort-hold-f", "sort-hold-a", "sort-hold-c", "sort-hold-b", "sort-hold-e", "sort-hold-d"]);
  // size_asc: b(10) d(20) c(30) a(40) e(50) f(60)
  expectIds("size_asc", ["sort-hold-b", "sort-hold-d", "sort-hold-c", "sort-hold-a", "sort-hold-e", "sort-hold-f"]);
  // size_desc
  expectIds("size_desc", ["sort-hold-f", "sort-hold-e", "sort-hold-a", "sort-hold-c", "sort-hold-d", "sort-hold-b"]);
});

test("identical normalized title keys fall back to the effective title then the stable file identity", (context) => {
  const { database, library, libraries } = fixture(context);
  // Two more holdings with the same canonical title but distinct display names.
  const seedA: HoldingSeed = { id: "sort-hold-g", displayName: "g-file.pdf", sizeBytes: 1, createdAt: "2026-08-21T06:00:00.000Z", canonicalTitle: "SameTitle", uploadedBy: OWNER.id };
  const seedB: HoldingSeed = { id: "sort-hold-h", displayName: "h-file.pdf", sizeBytes: 2, createdAt: "2026-08-21T07:00:00.000Z", canonicalTitle: "SameTitle", uploadedBy: OWNER.id };
  seedHolding(database, seedA, library.ownerDomainId);
  seedHolding(database, seedB, library.ownerDomainId);
  const ids = collectAll(libraries, OWNER.id, library.id, "title_asc");
  const sameTitle = ids.filter((id) => id === "sort-hold-g" || id === "sort-hold-h");
  assert.deepEqual(sameTitle, ["sort-hold-g", "sort-hold-h"]); // file-id tie-break, deterministic
});

test("an incompatible cursor from a different sort is rejected instead of mis-ordering", (context) => {
  const { library, libraries } = fixture(context);
  const page = libraries.listHoldingsSorted(OWNER.id, library.id, "newest", null, 2);
  assert.ok(page.nextCursor);
  assert.throws(
    () => libraries.listHoldingsSorted(OWNER.id, library.id, "title_asc", page.nextCursor, 2),
    (error: unknown) => error instanceof HoldingSortError && error.code === "invalid_cursor",
  );
  assert.throws(
    () => libraries.listHoldingsSorted(OWNER.id, library.id, "bogus" as "newest", null, 2),
    (error: unknown) => error instanceof HoldingSortError && error.code === "invalid_sort",
  );
});

test("members see the same deterministic sort and disabled accounts fail closed", (context) => {
  const { persistence, library, libraries } = fixture(context);
  const member: AuthenticatedAccount = { id: "sort-member", loginName: "sort-member", role: "member" };
  persistence.repositories.accounts.create({
    id: member.id,
    loginName: member.loginName,
    passwordHash: "test",
    role: "member",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  // canonical library migration 016 auto-memberships active accounts
  const page = libraries.listHoldingsSorted(member.id, library.id, "oldest", null, 2);
  assert.equal(page.holdings.length, 2);
  const disabled: AuthenticatedAccount = { id: "sort-disabled", loginName: "sort-disabled", role: "member" };
  persistence.repositories.accounts.create({
    id: disabled.id,
    loginName: disabled.loginName,
    passwordHash: "test",
    role: "member",
    state: "disabled",
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.throws(
    () => libraries.listHoldingsSorted(disabled.id, library.id, "oldest", null, 2),
    (error: unknown) => error instanceof LibraryError && error.code === "not_found",
  );
});

test("canonical title overrides the display name in title sorting", (context) => {
  const { library, libraries } = fixture(context);
  const page = libraries.listHoldingsSorted(OWNER.id, library.id, "title_asc", null, 100);
  const f = page.holdings.find((holding) => holding.file.id === "sort-hold-f")!;
  // The unrelated display name (zzz-unrelated.pdf) is overridden by the
  // canonical title, which pinyin-sorts after 元代宰相制度研究.pdf
  // (…yanjiupdf is a strict prefix of …yanjiuxiudingben).
  assert.equal(f.canonicalTitle, "元代宰相制度研究（修订本）");
  assert.equal(page.holdings.indexOf(f), 5);
  // Cursor chaining: the service-generated cursor resumes deterministically.
  const first = libraries.listHoldingsSorted(OWNER.id, library.id, "title_asc", null, 5);
  assert.deepEqual(first.holdings.map((holding) => holding.file.id),
    ["sort-hold-d", "sort-hold-e", "sort-hold-b", "sort-hold-c", "sort-hold-a"]);
  assert.ok(first.nextCursor);
  const second = libraries.listHoldingsSorted(OWNER.id, library.id, "title_asc", first.nextCursor, 100);
  assert.deepEqual(second.holdings.map((holding) => holding.file.id), ["sort-hold-f"]);
  assert.equal(second.nextCursor, null);
});
