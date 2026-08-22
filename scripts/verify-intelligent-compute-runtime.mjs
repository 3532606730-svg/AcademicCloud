import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED = Object.freeze({
  paddle: "3.3.1",
  paddleocr: "3.7.0",
  det: "5043d4ccc8d63402ccea8feefcee4db57077431a873e78d2191836a178a492da",
  rec: "406e1e689c9a7fbb04178007a3fe10cf852afe7bf8bb3bc6dbb9d532b13bd907",
  qwen: "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a",
  llamaAsset: "78ec7a1964710918030e85c132a0995b10b07e4f43001bdf54fe0fd48d1eb85b",
});

function fail(message) {
  throw new Error(`intelligent Compute runtime verification failed: ${message}`);
}

function hashFile(path) {
  return new Promise((resolveHash, reject) => {
    const digest = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolveHash(digest.digest("hex")));
  });
}

export async function verifyIntelligentComputeRuntime(rootValue) {
  const root = resolve(rootValue);
  const manifestPath = resolve(root, "runtime-manifest.json");
  if (!existsSync(manifestPath)) fail("manifest missing");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.paddle?.version !== EXPECTED.paddle || manifest.paddleocr?.version !== EXPECTED.paddleocr
    || manifest.detectionModel?.sha256 !== EXPECTED.det || manifest.recognitionModel?.sha256 !== EXPECTED.rec
    || manifest.qwen?.sha256 !== EXPECTED.qwen || manifest.llama?.assetSha256 !== EXPECTED.llamaAsset) fail("manifest pin mismatch");
  const paths = {
    python: resolve(root, "paddle/venv/bin/python"),
    requirements: resolve(root, "paddle/requirements-resolved.txt"),
    sidecar: resolve(root, "paddle/paddle_ocr_sidecar.py"),
    det: resolve(root, "paddle/models/PP-OCRv6_small_det/inference.pdiparams"),
    rec: resolve(root, "paddle/models/PP-OCRv6_small_rec/inference.pdiparams"),
    qwen: resolve(root, "qwen/Qwen3-1.7B-Q8_0.gguf"),
    llama: resolve(root, "llama/bin/llama-server"),
  };
  if (Object.values(paths).some((path) => !existsSync(path))) fail("runtime file missing");
  const [requirements, det, rec, qwen] = await Promise.all([hashFile(paths.requirements), hashFile(paths.det), hashFile(paths.rec), hashFile(paths.qwen)]);
  if (requirements !== manifest.paddle.resolvedRequirementsSha256) fail("resolved Paddle dependency inventory mismatch");
  if (det !== EXPECTED.det || rec !== EXPECTED.rec || qwen !== EXPECTED.qwen) fail("model payload digest mismatch");
  const python = spawnSync(paths.python, ["-I", "-c", "import paddle,paddleocr; print(paddle.__version__); print(paddleocr.__version__)"], { encoding: "utf8", timeout: 30_000 });
  if (python.status !== 0 || !python.stdout.includes(EXPECTED.paddle) || !python.stdout.includes(EXPECTED.paddleocr)) fail("Paddle package version mismatch");
  const llama = spawnSync(paths.llama, ["--version"], { encoding: "utf8", timeout: 30_000 });
  const llamaIdentity = `${llama.stdout}\n${llama.stderr}`;
  if (llama.status !== 0 || !llamaIdentity.includes("10218") || !llamaIdentity.includes("de69995")) {
    fail("llama.cpp version mismatch");
  }
  if (manifest.qualificationComparison !== undefined) {
    const visualModel = resolve(root, "comparison/qwen-vl/Qwen3VL-2B-Instruct-Q4_K_M.gguf");
    const visualProjector = resolve(root, "comparison/qwen-vl/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf");
    if (!existsSync(visualModel) || !existsSync(visualProjector)
      || manifest.qualificationComparison.purpose !== "qualification-only-not-production"
      || manifest.qualificationComparison.revision !== "52d6c8ffea26cc873ac5ad116f8631268d7eb503"
      || await hashFile(visualModel) !== "089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae"
      || await hashFile(visualProjector) !== "f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82") {
      fail("qualification-only Qwen-VL pin mismatch");
    }
  }
  return { root, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const root = process.argv[2];
  if (!root) fail("runtime root argument missing");
  const verified = await verifyIntelligentComputeRuntime(root);
  process.stdout.write(`${JSON.stringify({ status: "ok", runtimeRoot: verified.root, manifest: verified.manifest })}\n`);
}
