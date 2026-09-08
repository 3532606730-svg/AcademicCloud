#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 || $# != 3 )); then
  echo "usage (as root): assemble-local-compute-release.sh SOURCE_ARCHIVE SOURCE_COMMIT RELEASE_ROOT" >&2
  exit 2
fi

readonly SOURCE_ARCHIVE="$1"
readonly SOURCE_COMMIT="$2"
readonly RELEASE_ROOT="$3"
readonly COMPUTE_ROOT="/srv/academiccloud-compute"
readonly NODE_ROOT="/opt/academiccloud-compute/node/24.16.0"
readonly PADDLE_ROOT="${COMPUTE_ROOT}/qualification/paddle-3.3.1/gpu"
readonly LLAMA_ROOT="${COMPUTE_ROOT}/qualification/llama-b10218-cuda"
readonly NUEXTRACT_REPOSITORY="numind/NuExtract3-GGUF"
readonly NUEXTRACT_REVISION="28a1aae6288c5d50bdf999ca2e572240966d669b"
readonly NUEXTRACT_FILENAME="NuExtract3-Q5_K_M.gguf"
readonly NUEXTRACT_MODEL="${COMPUTE_ROOT}/models/${NUEXTRACT_REPOSITORY}/${NUEXTRACT_REVISION}/${NUEXTRACT_FILENAME}"
readonly NUEXTRACT_ASSET_MANIFEST="$(dirname "$NUEXTRACT_MODEL")/asset-manifest.json"
readonly NUEXTRACT_SHA256="1e6792f3402347785eb54e965255329e96204233b4bbf717c67a99f267736383"
readonly NUEXTRACT_BYTE_SIZE="3161424864"
readonly LLAMA_SOURCE_REVISION="de699957b92f490efebad149665b0dccf127eaff"
readonly LLAMA_SERVER_SHA256="ddfde527958667bf1b29603d8c0abe3a92e25decc5c7b5227b5736c4815c5c30"
readonly NODE_ARCHIVE_SHA256="d804845d34eddc21dc1092b519d643ef40b1f58ec5dec5c22b1f4bd8fabde6c9"
readonly PADDLE_GPU_WHEEL_SHA256="b1500120002c2bf4542c841e25296cf10c52e0d395053aa395f79bd9c0303cce"
readonly PADDLE_MODEL_INVENTORY_SHA256="3b147ad31b770278ea132fd7eddd3dea4a6efafabcb8fb795967a2eb6eef7eff"

[[ "$SOURCE_ARCHIVE" == /* ]]
[[ "$SOURCE_COMMIT" =~ ^[a-f0-9]{40}$ ]]
[[ "$RELEASE_ROOT" =~ ^${COMPUTE_ROOT}/releases/[a-f0-9]{40}$ ]]
test "$(basename "$RELEASE_ROOT")" = "$SOURCE_COMMIT"
test -f "$SOURCE_ARCHIVE"
test -x "${NODE_ROOT}/bin/node"
test -x "${PADDLE_ROOT}/venv/bin/python"
test -x "${LLAMA_ROOT}/bin/llama-server"
test -f "$NUEXTRACT_MODEL"
test -f "$NUEXTRACT_ASSET_MANIFEST"
test "$(jq -r '.archiveSha256' "${NODE_ROOT}/runtime-node.json")" = "$NODE_ARCHIVE_SHA256"
test "$(jq -r '.llama.fullRevision' "${LLAMA_ROOT}/runtime-manifest.json")" = "$LLAMA_SOURCE_REVISION"
test "$(jq -r '.llama.serverSha256' "${LLAMA_ROOT}/runtime-manifest.json")" = "$LLAMA_SERVER_SHA256"
printf '%s  %s\n' "$LLAMA_SERVER_SHA256" "${LLAMA_ROOT}/bin/llama-server" | sha256sum --check --strict
test "$(jq -r '.backend' "${PADDLE_ROOT}/runtime-manifest.json")" = "gpu"
test "$(jq -r '.paddle.wheelSha256' "${PADDLE_ROOT}/runtime-manifest.json")" = "$PADDLE_GPU_WHEEL_SHA256"
test "$(jq -r '.modelInventorySha256' "${PADDLE_ROOT}/runtime-manifest.json")" = "$PADDLE_MODEL_INVENTORY_SHA256"
test "$(stat -c '%U:%G|%a|%s' "$NUEXTRACT_MODEL")" = "root:academiccloud|440|${NUEXTRACT_BYTE_SIZE}"
test "$(jq -r '.model.repository' "$NUEXTRACT_ASSET_MANIFEST")" = "$NUEXTRACT_REPOSITORY"
test "$(jq -r '.model.revision' "$NUEXTRACT_ASSET_MANIFEST")" = "$NUEXTRACT_REVISION"
test "$(jq -r '.model.filename' "$NUEXTRACT_ASSET_MANIFEST")" = "$NUEXTRACT_FILENAME"
test "$(jq -r '.model.sha256' "$NUEXTRACT_ASSET_MANIFEST")" = "$NUEXTRACT_SHA256"
test "$(jq -r '.model.byteSize' "$NUEXTRACT_ASSET_MANIFEST")" = "$NUEXTRACT_BYTE_SIZE"
test "$(jq -r '.model.quantization' "$NUEXTRACT_ASSET_MANIFEST")" = "Q5_K_M"
test "$(jq -r '.model.architecture' "$NUEXTRACT_ASSET_MANIFEST")" = "qwen35"
printf '%s  %s\n' "$NUEXTRACT_SHA256" "$NUEXTRACT_MODEL" | sha256sum --check --strict

if [[ -e "$RELEASE_ROOT" ]]; then
  echo "release already exists: $RELEASE_ROOT" >&2
  exit 3
fi

readonly RELEASE_PARENT="$(dirname "$RELEASE_ROOT")"
readonly STAGING="${RELEASE_PARENT}/.${SOURCE_COMMIT}.staging.$$"
readonly SOURCE_STAGE="${STAGING}/source"
cleanup() {
  rm -rf -- "$STAGING"
}
trap cleanup EXIT

install -d -o root -g root -m 0755 "$RELEASE_PARENT"
install -d -o academiccloud -g academiccloud -m 0750 \
  "$STAGING" "$SOURCE_STAGE" "${COMPUTE_ROOT}/cache/npm"
tar -xf "$SOURCE_ARCHIVE" -C "$SOURCE_STAGE"
chown -R academiccloud:academiccloud "$STAGING" "${COMPUTE_ROOT}/cache/npm"

runuser -u academiccloud -- env \
  PATH="${NODE_ROOT}/bin:/usr/bin:/bin" \
  npm_config_cache="${COMPUTE_ROOT}/cache/npm" \
  npm exec --yes --package=npm@11.19.1 -- npm ci --strict-allow-scripts --workspace @academiccloud/compute-contracts --workspace @academiccloud/compute --include-workspace-root=true \
  --prefix "$SOURCE_STAGE"
runuser -u academiccloud -- env PATH="${NODE_ROOT}/bin:/usr/bin:/bin" \
  npm run build --workspace @academiccloud/compute-contracts --prefix "$SOURCE_STAGE"
runuser -u academiccloud -- env PATH="${NODE_ROOT}/bin:/usr/bin:/bin" \
  npm run build --workspace @academiccloud/compute --prefix "$SOURCE_STAGE"
runuser -u academiccloud -- env \
  PATH="${NODE_ROOT}/bin:/usr/bin:/bin" \
  npm_config_cache="${COMPUTE_ROOT}/cache/npm" \
  npm exec --yes --package=npm@11.19.1 -- npm ci --strict-allow-scripts --omit=dev --workspace @academiccloud/compute-contracts --workspace @academiccloud/compute \
  --include-workspace-root=false --prefix "$SOURCE_STAGE"

readonly OUTPUT="${STAGING}/release"
install -d -o academiccloud -g academiccloud -m 0750 \
  "$OUTPUT/compute" "$OUTPUT/compute-contracts" "$OUTPUT/deployment" "$OUTPUT/runtime"
cp -a "$SOURCE_STAGE/compute/dist" "$OUTPUT/compute/dist"
cp -a "$SOURCE_STAGE/compute/package.json" "$OUTPUT/compute/package.json"
cp -a "$SOURCE_STAGE/compute-contracts/dist" "$OUTPUT/compute-contracts/dist"
cp -a "$SOURCE_STAGE/compute-contracts/package.json" "$OUTPUT/compute-contracts/package.json"
cp -a "$SOURCE_STAGE/node_modules" "$OUTPUT/node_modules"
cp -a "$SOURCE_STAGE/deployment/systemd/academiccloud-local-compute.service" "$OUTPUT/deployment/academiccloud-local-compute.service"
cp -a "$SOURCE_STAGE/deployment/env/academiccloud-local-compute.env.example" "$OUTPUT/deployment/academiccloud-local-compute.env.example"
install -o academiccloud -g academiccloud -m 0750 \
  "$SOURCE_STAGE/scripts/local-compute/verify-local-compute-release.sh" \
  "$OUTPUT/deployment/verify-local-compute-release.sh"
cp -a "$NODE_ROOT" "$OUTPUT/runtime/node"
cp -a "$PADDLE_ROOT" "$OUTPUT/runtime/paddle"
cp -a "$LLAMA_ROOT" "$OUTPUT/runtime/llama"

test "$($OUTPUT/runtime/node/bin/node --version)" = "v24.16.0"
test "$($OUTPUT/runtime/paddle/venv/bin/python -I -c 'import paddle; print(paddle.__version__)')" = "3.3.1"
test "$($OUTPUT/runtime/llama/bin/llama-server --version 2>&1 | grep -c 'version: 10218 (de69995)')" = "1"
test -f "$OUTPUT/node_modules/pdfjs-dist/package.json"
test -f "$OUTPUT/node_modules/@napi-rs/canvas/package.json"
test -L "$OUTPUT/node_modules/@academiccloud/compute-contracts"
test "$(readlink "$OUTPUT/node_modules/@academiccloud/compute-contracts")" = "../../compute-contracts"
test -L "$OUTPUT/node_modules/@academiccloud/compute"
test "$(readlink "$OUTPUT/node_modules/@academiccloud/compute")" = "../../compute"
$OUTPUT/runtime/node/bin/node --check "$OUTPUT/compute/dist/local-pull-main.js"

readonly SOURCE_ARCHIVE_SHA256="$(sha256sum "$SOURCE_ARCHIVE" | awk '{print $1}')"
readonly PACKAGE_LOCK_SHA256="$(sha256sum "$SOURCE_STAGE/package-lock.json" | awk '{print $1}')"
readonly PADDLE_MANIFEST_SHA256="$(sha256sum "$OUTPUT/runtime/paddle/runtime-manifest.json" | awk '{print $1}')"
readonly LLAMA_MANIFEST_SHA256="$(sha256sum "$OUTPUT/runtime/llama/runtime-manifest.json" | awk '{print $1}')"
jq -n \
  --arg sourceCommit "$SOURCE_COMMIT" \
  --arg sourceArchiveSha256 "$SOURCE_ARCHIVE_SHA256" \
  --arg packageLockSha256 "$PACKAGE_LOCK_SHA256" \
  --arg nodeVersion "24.16.0" \
  --arg nodeArchiveSha256 "$NODE_ARCHIVE_SHA256" \
  --arg paddleManifestSha256 "$PADDLE_MANIFEST_SHA256" \
  --arg llamaRevision "$LLAMA_SOURCE_REVISION" \
  --arg llamaManifestSha256 "$LLAMA_MANIFEST_SHA256" \
  --arg modelPath "$NUEXTRACT_MODEL" \
  --arg modelRepository "$NUEXTRACT_REPOSITORY" \
  --arg modelRevision "$NUEXTRACT_REVISION" \
  --arg modelFilename "$NUEXTRACT_FILENAME" \
  --arg modelSha256 "$NUEXTRACT_SHA256" \
  --argjson modelByteSize "$NUEXTRACT_BYTE_SIZE" \
  '{
    contractVersion: 2,
    provider: "local_pull",
    source: {commit: $sourceCommit, archiveSha256: $sourceArchiveSha256, packageLockSha256: $packageLockSha256},
    node: {version: $nodeVersion, archiveSha256: $nodeArchiveSha256},
    paddle: {backend: "gpu", manifestSha256: $paddleManifestSha256},
    llama: {backend: "CUDA", revision: $llamaRevision, manifestSha256: $llamaManifestSha256},
    reasoningModel: {
      family: "NuExtract3",
      identity: "NuExtract3-4B",
      architecture: "qwen35",
      repository: $modelRepository,
      revision: $modelRevision,
      filename: $modelFilename,
      quantization: "Q5_K_M",
      byteSize: $modelByteSize,
      sha256: $modelSha256,
      shared: true,
      path: $modelPath
    },
    worker: {entrypoint: "compute/dist/local-pull-main.js", concurrency: 1}
  }' > "$OUTPUT/release-manifest.json"

(
  cd "$OUTPUT"
  find . -type f ! -name release-files.sha256 -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 sha256sum > release-files.sha256
)
readonly RELEASE_INVENTORY_SHA256="$(sha256sum "$OUTPUT/release-files.sha256" | awk '{print $1}')"
printf '%s\n' "$RELEASE_INVENTORY_SHA256" > "$OUTPUT/release-files.sha256.sha256"

chown -R root:root "$OUTPUT"
find "$OUTPUT" -type d -exec chmod 0555 {} +
find "$OUTPUT" -type f -perm /111 -exec chmod 0555 {} +
find "$OUTPUT" -type f ! -perm /111 -exec chmod 0444 {} +
mv -- "$OUTPUT" "$RELEASE_ROOT"
trap - EXIT
rm -rf -- "$STAGING"

printf 'LOCAL_COMPUTE_RELEASE_ASSEMBLY=PASS\n'
printf 'SOURCE_COMMIT=%s\n' "$SOURCE_COMMIT"
printf 'RELEASE_INVENTORY_SHA256=%s\n' "$RELEASE_INVENTORY_SHA256"
