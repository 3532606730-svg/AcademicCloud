#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 || $# != 3 )); then
  echo "usage (as root): assemble-catalog-bridge-release.sh SOURCE_ARCHIVE SOURCE_COMMIT RELEASE_ROOT" >&2
  exit 2
fi

readonly SOURCE_ARCHIVE="$1"
readonly SOURCE_COMMIT="$2"
readonly RELEASE_ROOT="$3"
readonly COMPUTE_ROOT="/srv/academiccloud-compute"
readonly RELEASE_PARENT="${COMPUTE_ROOT}/catalog-releases"
readonly NODE_ROOT="/opt/academiccloud-compute/node/24.16.0"
readonly PADDLE_ROOT="${COMPUTE_ROOT}/qualification/paddle-3.3.1/gpu"
readonly NODE_ARCHIVE_SHA256="d804845d34eddc21dc1092b519d643ef40b1f58ec5dec5c22b1f4bd8fabde6c9"
readonly PADDLE_GPU_WHEEL_SHA256="b1500120002c2bf4542c841e25296cf10c52e0d395053aa395f79bd9c0303cce"
readonly PADDLE_MODEL_INVENTORY_SHA256="3b147ad31b770278ea132fd7eddd3dea4a6efafabcb8fb795967a2eb6eef7eff"

[[ "$SOURCE_ARCHIVE" == /* ]]
[[ "$SOURCE_COMMIT" =~ ^[a-f0-9]{40}$ ]]
[[ "$RELEASE_ROOT" =~ ^${RELEASE_PARENT}/[a-f0-9]{40}$ ]]
test "$(basename "$RELEASE_ROOT")" = "$SOURCE_COMMIT"
test -f "$SOURCE_ARCHIVE"
test -x "${NODE_ROOT}/bin/node"
test -x "${PADDLE_ROOT}/venv/bin/python"
test "$(jq -r '.archiveSha256' "${NODE_ROOT}/runtime-node.json")" = "$NODE_ARCHIVE_SHA256"
test "$(jq -r '.backend' "${PADDLE_ROOT}/runtime-manifest.json")" = "gpu"
test "$(jq -r '.paddle.wheelSha256' "${PADDLE_ROOT}/runtime-manifest.json")" = "$PADDLE_GPU_WHEEL_SHA256"
test "$(jq -r '.modelInventorySha256' "${PADDLE_ROOT}/runtime-manifest.json")" = "$PADDLE_MODEL_INVENTORY_SHA256"

if [[ -e "$RELEASE_ROOT" ]]; then
  echo "catalog bridge release already exists: $RELEASE_ROOT" >&2
  exit 3
fi

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
  npm ci --workspace @academiccloud/compute-contracts --workspace @academiccloud/compute --include-workspace-root=true \
  --prefix "$SOURCE_STAGE"
runuser -u academiccloud -- env PATH="${NODE_ROOT}/bin:/usr/bin:/bin" \
  npm run build --workspace @academiccloud/compute-contracts --prefix "$SOURCE_STAGE"
runuser -u academiccloud -- env PATH="${NODE_ROOT}/bin:/usr/bin:/bin" \
  npm run build --workspace @academiccloud/compute --prefix "$SOURCE_STAGE"
runuser -u academiccloud -- env \
  PATH="${NODE_ROOT}/bin:/usr/bin:/bin" \
  npm_config_cache="${COMPUTE_ROOT}/cache/npm" \
  npm ci --omit=dev --workspace @academiccloud/compute-contracts --workspace @academiccloud/compute \
  --include-workspace-root=false --prefix "$SOURCE_STAGE"

readonly OUTPUT="${STAGING}/release"
install -d -o academiccloud -g academiccloud -m 0750 \
  "$OUTPUT/compute" "$OUTPUT/compute-contracts" "$OUTPUT/deployment" "$OUTPUT/runtime"
cp -a "$SOURCE_STAGE/compute/dist" "$OUTPUT/compute/dist"
cp -a "$SOURCE_STAGE/compute/package.json" "$OUTPUT/compute/package.json"
cp -a "$SOURCE_STAGE/compute-contracts/dist" "$OUTPUT/compute-contracts/dist"
cp -a "$SOURCE_STAGE/compute-contracts/package.json" "$OUTPUT/compute-contracts/package.json"
cp -a "$SOURCE_STAGE/node_modules" "$OUTPUT/node_modules"
cp -a "$SOURCE_STAGE/deployment/systemd/academiccloud-catalog-bridge.service" "$OUTPUT/deployment/academiccloud-catalog-bridge.service"
install -o academiccloud -g academiccloud -m 0750 \
  "$SOURCE_STAGE/scripts/local-compute/verify-catalog-bridge-release.sh" \
  "$OUTPUT/deployment/verify-catalog-bridge-release.sh"
cp -a "$NODE_ROOT" "$OUTPUT/runtime/node"
cp -a "$PADDLE_ROOT" "$OUTPUT/runtime/paddle"

test "$($OUTPUT/runtime/node/bin/node --version)" = "v24.16.0"
test "$($OUTPUT/runtime/paddle/venv/bin/python -I -c 'import paddle; print(paddle.__version__)')" = "3.3.1"
test -f "$OUTPUT/node_modules/pdfjs-dist/package.json"
test -f "$OUTPUT/node_modules/@napi-rs/canvas/package.json"
test -L "$OUTPUT/node_modules/@academiccloud/compute-contracts"
test "$(readlink "$OUTPUT/node_modules/@academiccloud/compute-contracts")" = "../../compute-contracts"
test -L "$OUTPUT/node_modules/@academiccloud/compute"
test "$(readlink "$OUTPUT/node_modules/@academiccloud/compute")" = "../../compute"
$OUTPUT/runtime/node/bin/node --check "$OUTPUT/compute/dist/catalog-bridge.js"
test ! -e "$OUTPUT/runtime/llama"

readonly SOURCE_ARCHIVE_SHA256="$(sha256sum "$SOURCE_ARCHIVE" | awk '{print $1}')"
readonly PACKAGE_LOCK_SHA256="$(sha256sum "$SOURCE_STAGE/package-lock.json" | awk '{print $1}')"
readonly PADDLE_MANIFEST_SHA256="$(sha256sum "$OUTPUT/runtime/paddle/runtime-manifest.json" | awk '{print $1}')"
jq -n \
  --arg sourceCommit "$SOURCE_COMMIT" \
  --arg sourceArchiveSha256 "$SOURCE_ARCHIVE_SHA256" \
  --arg packageLockSha256 "$PACKAGE_LOCK_SHA256" \
  --arg nodeVersion "24.16.0" \
  --arg nodeArchiveSha256 "$NODE_ARCHIVE_SHA256" \
  --arg paddleManifestSha256 "$PADDLE_MANIFEST_SHA256" \
  '{
    contractVersion: 1,
    provider: "catalog_bridge",
    source: {commit: $sourceCommit, archiveSha256: $sourceArchiveSha256, packageLockSha256: $packageLockSha256},
    node: {version: $nodeVersion, archiveSha256: $nodeArchiveSha256},
    paddle: {backend: "gpu", manifestSha256: $paddleManifestSha256},
    bridge: {entrypoint: "compute/dist/catalog-bridge.js", host: "127.0.0.1", port: 43117, concurrency: 1}
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

printf 'CATALOG_BRIDGE_RELEASE_ASSEMBLY=PASS\n'
printf 'SOURCE_COMMIT=%s\n' "$SOURCE_COMMIT"
printf 'RELEASE_INVENTORY_SHA256=%s\n' "$RELEASE_INVENTORY_SHA256"
