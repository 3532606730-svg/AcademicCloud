import assert from "node:assert/strict";
import { test } from "node:test";

import { createApp } from "../../src/platform/app.js";

test("GET /api/health reports a healthy API", async (context) => {
  const app = await createApp({ logger: false });
  context.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "academiccloud-api",
  });
});
