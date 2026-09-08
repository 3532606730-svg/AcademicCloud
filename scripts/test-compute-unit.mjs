import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const testDirectory = join(root, "compute", "test");
// These two tests launch the actual release-local OCR engines. Their explicit
// runtime qualification remains separate from the ordinary regression suite.
// PDF.js, native canvas, fake OCR sidecars, bridge, lease and contract tests run.
const runtimeQualification = new Set([
  "realistic-ocr-e2e.test.ts",
  "realistic-paddle-ocr-e2e.test.ts",
]);
const tests = readdirSync(testDirectory, { recursive: true })
  .filter((name) => name.endsWith(".test.ts") && !runtimeQualification.has(name))
  .sort()
  .map((name) => join(testDirectory, name));
if (tests.length === 0) throw new Error("No Compute regression tests discovered");
const result = spawnSync(process.execPath, [
  "--import", "tsx", "--test", "--test-concurrency=1", ...process.argv.slice(2), ...tests,
], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
