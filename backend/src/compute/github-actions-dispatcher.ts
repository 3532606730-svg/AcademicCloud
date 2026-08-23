import { timingSafeEqual } from "node:crypto";

import type {
  DerivedComputeDispatchJob,
  DerivedComputeDispatcher,
  DerivedComputeDispatchReceipt,
} from "@academiccloud/compute-contracts";

const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u;
const WORKFLOW = /^[A-Za-z0-9_.-]{1,128}\.ya?ml$/u;
const REF = /^[A-Za-z0-9._/-]{1,256}$/u;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/u;
const RUN_NAME_PREFIX = "AcademicCloud derived compute";

export class DerivedComputeUnavailableError extends Error {
  constructor() {
    super("derived_compute_unavailable");
    this.name = "DerivedComputeUnavailableError";
  }
}

export class UnavailableDerivedComputeDispatcher implements DerivedComputeDispatcher {
  async dispatch(): Promise<DerivedComputeDispatchReceipt> {
    throw new DerivedComputeUnavailableError();
  }
}

export interface GitHubActionsComputeConfig {
  repository: string;
  workflow: string;
  ref: string;
  token: string;
}

export class GitHubActionsComputeDispatcher implements DerivedComputeDispatcher {
  readonly #config: GitHubActionsComputeConfig;
  readonly #fetch: typeof fetch;

  constructor(config: GitHubActionsComputeConfig, fetchImplementation: typeof fetch = fetch) {
    if (!REPOSITORY.test(config.repository) || !WORKFLOW.test(config.workflow) || !REF.test(config.ref)) {
      throw new Error("GitHub Actions compute routing is invalid");
    }
    if (config.token.length < 20 || config.token.length > 512 || /[\u0000\r\n]/u.test(config.token)) {
      throw new Error("GitHub Actions compute token is invalid");
    }
    this.#config = config;
    this.#fetch = fetchImplementation;
  }

  #providerJobId(attemptId: string): string {
    return `github-actions:${this.#config.repository}:${this.#config.workflow}:${attemptId}`;
  }

  #runName(job: DerivedComputeDispatchJob): string {
    return `${RUN_NAME_PREFIX} ${job.id}/${job.attemptId}`;
  }

  async #findExistingRun(job: DerivedComputeDispatchJob): Promise<string | null> {
    const response = await this.#fetch(
      `https://api.github.com/repos/${this.#config.repository}/actions/workflows/${encodeURIComponent(this.#config.workflow)}/runs?event=workflow_dispatch&per_page=100`,
      {
        method: "GET",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${this.#config.token}`,
          "x-github-api-version": "2022-11-28",
        },
      },
    );
    if (response.status !== 200) throw new DerivedComputeUnavailableError();
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new DerivedComputeUnavailableError();
    }
    if (typeof payload !== "object" || payload === null || !Array.isArray((payload as { workflow_runs?: unknown }).workflow_runs)) {
      throw new DerivedComputeUnavailableError();
    }
    const expectedName = this.#runName(job);
    const run = (payload as { workflow_runs: unknown[] }).workflow_runs.find((entry) => {
      if (typeof entry !== "object" || entry === null) return false;
      const candidate = entry as { id?: unknown; display_title?: unknown; run_name?: unknown };
      return Number.isSafeInteger(candidate.id)
        && [candidate.display_title, candidate.run_name].some((name) => name === expectedName);
    });
    if (!run) return null;
    return String((run as { id: number }).id);
  }

  async dispatch(job: DerivedComputeDispatchJob): Promise<DerivedComputeDispatchReceipt> {
    if (!IDENTIFIER.test(job.id) || !IDENTIFIER.test(job.attemptId)) {
      throw new DerivedComputeUnavailableError();
    }
    const existingRunId = await this.#findExistingRun(job);
    if (existingRunId) {
      return {
        provider: "github_actions",
        providerJobId: `${this.#providerJobId(job.attemptId)}:run-${existingRunId}`,
      };
    }
    const response = await this.#fetch(
      `https://api.github.com/repos/${this.#config.repository}/actions/workflows/${encodeURIComponent(this.#config.workflow)}/dispatches`,
      {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${this.#config.token}`,
          "content-type": "application/json",
          "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify({
          ref: this.#config.ref,
          inputs: {
            job_id: job.id,
            attempt_id: job.attemptId,
            core_base_url: job.coreBaseUrl,
          },
        }),
      },
    );
    if (response.status !== 204) throw new DerivedComputeUnavailableError();
    return {
      provider: "github_actions",
      providerJobId: this.#providerJobId(job.attemptId),
    };
  }
}

export interface DerivedComputeRuntime {
  dispatcher: DerivedComputeDispatcher;
  bootstrapSecret: string | null;
  coreBaseUrl: string;
}

function exactOrigin(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  const url = new URL(candidate);
  if (url.origin !== candidate || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) {
    throw new Error("COMPUTE_CORE_BASE_URL must be an exact HTTPS origin outside loopback development");
  }
  return candidate;
}

export function loadDerivedComputeRuntime(
  environment: NodeJS.ProcessEnv,
  appOrigin: string,
): DerivedComputeRuntime {
  const coreBaseUrl = exactOrigin(environment.COMPUTE_CORE_BASE_URL, appOrigin);
  const provider = environment.COMPUTE_PROVIDER?.trim() || "disabled";
  const bootstrapSecret = environment.COMPUTE_WORKER_BOOTSTRAP_SECRET?.trim() || null;
  if (bootstrapSecret && (bootstrapSecret.length < 32 || bootstrapSecret.length > 512 || /[\u0000\r\n]/u.test(bootstrapSecret))) {
    throw new Error("Compute worker bootstrap secret is invalid");
  }
  if (provider === "disabled") {
    return { dispatcher: new UnavailableDerivedComputeDispatcher(), bootstrapSecret, coreBaseUrl };
  }
  if (provider !== "github_actions") throw new Error("COMPUTE_PROVIDER must be disabled or github_actions");
  const token = environment.GITHUB_COMPUTE_DISPATCH_TOKEN?.trim();
  const repository = environment.GITHUB_COMPUTE_REPOSITORY?.trim();
  const workflow = environment.GITHUB_COMPUTE_WORKFLOW?.trim() || "derived-compute-worker.yml";
  const ref = environment.GITHUB_COMPUTE_REF?.trim();
  if (!token || !repository || !ref || !bootstrapSecret) {
    throw new Error("GitHub Actions compute requires dispatch token, repository, ref, and worker bootstrap secret");
  }
  return {
    dispatcher: new GitHubActionsComputeDispatcher({ repository, workflow, ref, token }),
    bootstrapSecret,
    coreBaseUrl,
  };
}

export function secureSecretEquals(expected: string | null, supplied: string | undefined): boolean {
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}
