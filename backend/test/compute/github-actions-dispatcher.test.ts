import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GitHubActionsComputeDispatcher,
  loadDerivedComputeRuntime,
  secureSecretEquals,
} from "../../src/compute/github-actions-dispatcher.js";

test("GitHub Actions adapter dispatches opaque identity only", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchImplementation: typeof fetch = async (input, init = {}) => {
    requests.push({ url: String(input), init });
    if (init.method === "GET") return new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 });
    return new Response(null, { status: 204 });
  };
  const dispatcher = new GitHubActionsComputeDispatcher({
    repository: "academiccloud/core",
    workflow: "derived-compute-worker.yml",
    ref: "codex/compute-release",
    token: "github-dispatch-token-that-is-long-enough",
  }, fetchImplementation);
  const receipt = await dispatcher.dispatch({
    id: "job-1",
    kind: "metadata_suggestion",
    resourceId: "file-secret-id",
    attemptId: "attempt-1",
    coreBaseUrl: "https://cloud.example.edu",
  });
  assert.equal(receipt.provider, "github_actions");
  assert.equal(requests[0]!.url, "https://api.github.com/repos/academiccloud/core/actions/workflows/derived-compute-worker.yml/runs?event=workflow_dispatch&per_page=100");
  assert.equal(requests[1]!.url, "https://api.github.com/repos/academiccloud/core/actions/workflows/derived-compute-worker.yml/dispatches");
  assert.equal(new Headers(requests[1]!.init.headers).get("authorization"), "Bearer github-dispatch-token-that-is-long-enough");
  const body = JSON.parse(String(requests[1]!.init.body));
  assert.deepEqual(body, {
    ref: "codex/compute-release",
    inputs: {
      job_id: "job-1",
      attempt_id: "attempt-1",
      core_base_url: "https://cloud.example.edu",
    },
  });
  assert.equal(JSON.stringify(body).includes("file-secret-id"), false);
  assert.equal(JSON.stringify(body).includes("object"), false);
});

test("GitHub Actions adapter recovers an accepted run without a second dispatch", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchImplementation: typeof fetch = async (input, init = {}) => {
    requests.push({ url: String(input), init });
    if (init.method === "GET") {
      return new Response(JSON.stringify({ workflow_runs: [{ id: 8123, display_title: "AcademicCloud derived compute job-1/attempt-1" }] }), { status: 200 });
    }
    throw new Error("a second workflow dispatch would be a duplicate provider execution");
  };
  const dispatcher = new GitHubActionsComputeDispatcher({
    repository: "academiccloud/core",
    workflow: "derived-compute-worker.yml",
    ref: "codex/compute-release",
    token: "github-dispatch-token-that-is-long-enough",
  }, fetchImplementation);
  const receipt = await dispatcher.dispatch({
    id: "job-1",
    kind: "metadata_suggestion",
    resourceId: "file-1",
    attemptId: "attempt-1",
    coreBaseUrl: "https://cloud.example.edu",
  });
  assert.equal(receipt.providerJobId, "github-actions:academiccloud/core:derived-compute-worker.yml:attempt-1:run-8123");
  assert.equal(requests.length, 1);
});

test("runtime configuration fails closed unless every provider credential and route is present", async () => {
  const disabled = loadDerivedComputeRuntime({}, "https://cloud.example.edu");
  assert.equal(disabled.bootstrapSecret, null);
  assert.throws(() => loadDerivedComputeRuntime({ COMPUTE_PROVIDER: "github_actions" }, "https://cloud.example.edu"));
  const configured = loadDerivedComputeRuntime({
    COMPUTE_PROVIDER: "github_actions",
    COMPUTE_CORE_BASE_URL: "https://cloud.example.edu",
    COMPUTE_WORKER_BOOTSTRAP_SECRET: "bootstrap-secret-that-is-long-enough",
    GITHUB_COMPUTE_DISPATCH_TOKEN: "dispatch-secret-that-is-long-enough",
    GITHUB_COMPUTE_REPOSITORY: "academiccloud/core",
    GITHUB_COMPUTE_REF: "codex/compute-release",
  }, "https://cloud.example.edu");
  assert.equal(configured.bootstrapSecret, "bootstrap-secret-that-is-long-enough");
  assert.equal(configured.coreBaseUrl, "https://cloud.example.edu");

  assert.throws(() => loadDerivedComputeRuntime({ COMPUTE_PROVIDER: "local_pull" }, "https://cloud.example.edu"));
  const local = loadDerivedComputeRuntime({
    COMPUTE_PROVIDER: "local_pull",
    COMPUTE_WORKER_BOOTSTRAP_SECRET: "local-machine-secret-that-is-long-enough",
  }, "https://cloud.example.edu");
  assert.deepEqual(await dispatchReceipt(local.dispatcher), {
    provider: "local_pull",
    providerJobId: "local-pull:attempt-local",
  });
});

function dispatchReceipt(dispatcher: ReturnType<typeof loadDerivedComputeRuntime>["dispatcher"]) {
  return dispatcher.dispatch({
    id: "job-local",
    attemptId: "attempt-local",
    kind: "metadata_suggestion",
    resourceId: "resource-local",
    coreBaseUrl: "https://cloud.example.edu",
  });
}

test("bootstrap comparison is exact and rejects absent or differently sized secrets", () => {
  assert.equal(secureSecretEquals("a".repeat(32), "a".repeat(32)), true);
  assert.equal(secureSecretEquals("a".repeat(32), "b".repeat(32)), false);
  assert.equal(secureSecretEquals("a".repeat(32), "a".repeat(31)), false);
  assert.equal(secureSecretEquals(null, "a".repeat(32)), false);
});
