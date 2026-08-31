import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ASSEMBLER = new URL("../../scripts/local-compute/assemble-local-compute-release.sh", import.meta.url);
const ACTIVATOR = new URL("../../scripts/local-compute/activate-local-compute-release.sh", import.meta.url);
const VERIFIER = new URL("../../scripts/local-compute/verify-local-compute-release.sh", import.meta.url);

test("Local Compute release references one exact shared NuExtract asset", async () => {
  const source = await readFile(ASSEMBLER, "utf8");
  assert.match(source, /numind\/NuExtract3-GGUF/u);
  assert.match(source, /28a1aae6288c5d50bdf999ca2e572240966d669b/u);
  assert.match(source, /NuExtract3-Q5_K_M\.gguf/u);
  assert.match(source, /1e6792f3402347785eb54e965255329e96204233b4bbf717c67a99f267736383/u);
  assert.match(source, /reasoningModel/u);
  assert.match(source, /shared: true/u);
  assert.match(source, /verify-local-compute-release\.sh/u);
  assert.match(source, /install -o academiccloud -g academiccloud -m 0750[\s\S]*verify-local-compute-release\.sh/u);
  assert.doesNotMatch(source, /runtime\/qwen/u);
  assert.doesNotMatch(source, /install .*\$NUEXTRACT_MODEL.*\$OUTPUT/u);
});

test("release verification rehashes the shared model before activation", async () => {
  const [verifier, activator] = await Promise.all([
    readFile(VERIFIER, "utf8"),
    readFile(ACTIVATOR, "utf8"),
  ]);
  assert.match(verifier, /reasoningModel\.path/u);
  assert.match(verifier, /root:academiccloud\|440/u);
  assert.match(verifier, /sha256sum --check --strict/u);
  assert.match(verifier, /LOCAL_COMPUTE_RELEASE_VERIFIER=PASS/u);
  assert.match(activator, /deployment\/verify-local-compute-release\.sh/u);
  assert.match(activator, /"\$RELEASE_ROOT\/deployment\/verify-local-compute-release\.sh" "\$RELEASE_ROOT"/u);
});
