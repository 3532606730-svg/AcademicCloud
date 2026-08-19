import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { test } from "node:test";

import type { AuthService, AuthenticatedAccount } from "../../src/auth/auth-service.js";
import { createApp } from "../../src/platform/app.js";
import { SuggestionError, type SuggestionService } from "../../src/suggestions/suggestion-service.js";

const ORIGIN = "http://127.0.0.1";
const ACTOR: AuthenticatedAccount = { id: "suggestion-owner", loginName: "suggestion-owner", role: "owner" };

function unexpectedSuggestionFailure(): never {
  throw new TypeError(
    "PDF text secret; OCR text secret; object-key-secret; https://storage.invalid/object?signed-url-secret; credential-secret",
  );
}

test("unexpected suggestion generation failures keep a safe response and a bounded diagnostic stack", async (context) => {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  let failure: unknown = "unexpected";
  const authService = { resolveSession: () => ACTOR } as unknown as AuthService;
  const suggestionService = {
    async generate() {
      if (failure instanceof Error) throw failure;
      return unexpectedSuggestionFailure();
    },
  } as unknown as SuggestionService;
  const app = await createApp({
    logger: { level: "info", stream },
    auth: { service: authService, appOrigin: ORIGIN, environment: "test" },
    suggestions: { service: suggestionService },
  });
  context.after(() => app.close());
  const request = () => app.inject({
    method: "POST",
    url: "/api/libraries/canonical-library/holdings/file-1/metadata/suggestions",
    headers: { accept: "application/json", origin: ORIGIN, cookie: "ac_session=session" },
  });

  const unexpected = await request();
  assert.equal(unexpected.statusCode, 500);
  assert.deepEqual(unexpected.json(), { error: "metadata_suggestion_internal_error" });

  const entries = output.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  const diagnostic = entries.find((entry) => entry.event === "metadata_suggestion.generation_failed");
  assert.ok(diagnostic);
  assert.equal(diagnostic.errorType, "TypeError");
  assert.match(String(diagnostic.errorStack), /unexpectedSuggestionFailure/u);
  assert.equal("error" in diagnostic, false);
  for (const sensitive of [
    "PDF text secret",
    "OCR text secret",
    "object-key-secret",
    "signed-url-secret",
    "credential-secret",
  ]) {
    assert.equal(output.includes(sensitive), false, `diagnostic log contained ${sensitive}`);
  }

  for (const [code, status] of [
    ["invalid_input", 400],
    ["conflict", 409],
    ["concurrent_change", 409],
    ["stale", 409],
    ["unsupported", 422],
    ["not_found", 404],
  ] as const) {
    failure = new SuggestionError(code);
    const expected = await request();
    assert.equal(expected.statusCode, status);
    assert.deepEqual(expected.json(), { error: code });
  }
  const updatedEntries = output.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.equal(updatedEntries.filter((entry) => entry.event === "metadata_suggestion.generation_failed").length, 1);
});
