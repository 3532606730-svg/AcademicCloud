#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 || $# != 1 )); then
  echo "usage (as root): verify-catalog-bridge-release.sh RELEASE_ROOT" >&2
  exit 2
fi

readonly RELEASE_ROOT="$1"
readonly COMPUTE_ROOT="/srv/academiccloud-compute"
readonly RELEASE_PARENT="${COMPUTE_ROOT}/catalog-releases"
readonly NODE_ARCHIVE_SHA256="d804845d34eddc21dc1092b519d643ef40b1f58ec5dec5c22b1f4bd8fabde6c9"
readonly PADDLE_GPU_WHEEL_SHA256="b1500120002c2bf4542c841e25296cf10c52e0d395053aa395f79bd9c0303cce"
readonly PADDLE_MODEL_INVENTORY_SHA256="3b147ad31b770278ea132fd7eddd3dea4a6efafabcb8fb795967a2eb6eef7eff"
readonly UNIT="${RELEASE_ROOT}/deployment/academiccloud-catalog-bridge.service"

[[ "$RELEASE_ROOT" =~ ^${RELEASE_PARENT}/[a-f0-9]{40}$ ]]
test -d "$RELEASE_ROOT"
test -f "$RELEASE_ROOT/release-manifest.json"
test -f "$RELEASE_ROOT/release-files.sha256"
test -f "$RELEASE_ROOT/release-files.sha256.sha256"
test -x "$RELEASE_ROOT/runtime/node/bin/node"
test -x "$RELEASE_ROOT/runtime/paddle/venv/bin/python"
test -f "$RELEASE_ROOT/compute/dist/catalog-bridge.js"
test -f "$UNIT"
test ! -e "$RELEASE_ROOT/runtime/llama"
test "$(stat -c '%U:%G|%a' "$RELEASE_ROOT")" = "root:root|555"
test -z "$(find "$RELEASE_ROOT" -xdev \( -type f -o -type d \) -perm /022 -print -quit)"

test "$(jq -r '.contractVersion' "$RELEASE_ROOT/release-manifest.json")" = "1"
test "$(jq -r '.provider' "$RELEASE_ROOT/release-manifest.json")" = "catalog_bridge"
test "$(jq -r '.source.commit' "$RELEASE_ROOT/release-manifest.json")" = "$(basename "$RELEASE_ROOT")"
test "$(jq -r '.node.version' "$RELEASE_ROOT/release-manifest.json")" = "24.16.0"
test "$(jq -r '.node.archiveSha256' "$RELEASE_ROOT/release-manifest.json")" = "$NODE_ARCHIVE_SHA256"
test "$(jq -r '.paddle.backend' "$RELEASE_ROOT/release-manifest.json")" = "gpu"
test "$(jq -r '.bridge.entrypoint' "$RELEASE_ROOT/release-manifest.json")" = "compute/dist/catalog-bridge.js"
test "$(jq -r '.bridge.host' "$RELEASE_ROOT/release-manifest.json")" = "127.0.0.1"
test "$(jq -r '.bridge.port' "$RELEASE_ROOT/release-manifest.json")" = "43117"
test "$(jq -r '.bridge.concurrency' "$RELEASE_ROOT/release-manifest.json")" = "1"
jq -e 'has("llama") | not' "$RELEASE_ROOT/release-manifest.json" >/dev/null
jq -e 'has("reasoningModel") | not' "$RELEASE_ROOT/release-manifest.json" >/dev/null
jq -e 'has("worker") | not' "$RELEASE_ROOT/release-manifest.json" >/dev/null

printf '%s  %s\n' "$(cat "$RELEASE_ROOT/release-files.sha256.sha256")" "$RELEASE_ROOT/release-files.sha256" \
  | sha256sum --check --strict
(
  cd "$RELEASE_ROOT"
  sha256sum --check --strict release-files.sha256 >/dev/null
)

"$RELEASE_ROOT/runtime/node/bin/node" --check "$RELEASE_ROOT/compute/dist/catalog-bridge.js" >/dev/null
test "$($RELEASE_ROOT/runtime/node/bin/node --version)" = "v24.16.0"
test "$($RELEASE_ROOT/runtime/paddle/venv/bin/python -I -c 'import paddle; print(paddle.__version__)')" = "3.3.1"
test "$(jq -r '.backend' "$RELEASE_ROOT/runtime/paddle/runtime-manifest.json")" = "gpu"
test "$(jq -r '.paddle.wheelSha256' "$RELEASE_ROOT/runtime/paddle/runtime-manifest.json")" = "$PADDLE_GPU_WHEEL_SHA256"
test "$(jq -r '.modelInventorySha256' "$RELEASE_ROOT/runtime/paddle/runtime-manifest.json")" = "$PADDLE_MODEL_INVENTORY_SHA256"
test "$(sha256sum "$RELEASE_ROOT/runtime/paddle/runtime-manifest.json" | awk '{print $1}')" = \
  "$(jq -r '.paddle.manifestSha256' "$RELEASE_ROOT/release-manifest.json")"

grep -Fqx 'WorkingDirectory=/srv/academiccloud-compute/catalog-current/compute' "$UNIT"
grep -Fqx 'Environment=ACADEMICCLOUD_CATALOG_BRIDGE_PORT=43117' "$UNIT"
grep -Fqx 'Environment=ACADEMICCLOUD_CATALOG_BRIDGE_ORIGINS=https://cloud.ajtlab.top' "$UNIT"
grep -Fqx 'Environment=ACADEMICCLOUD_CATALOG_CORE_ORIGIN=https://cloud.ajtlab.top' "$UNIT"
grep -Fqx 'Environment=ACADEMICCLOUD_CATALOG_SOURCE_ORIGINS=https://academiccloud-private.oss-ap-southeast-3.aliyuncs.com,https://files.ajtlab.top' "$UNIT"
grep -Fqx 'ExecStart=/srv/academiccloud-compute/catalog-current/runtime/node/bin/node /srv/academiccloud-compute/catalog-current/compute/dist/catalog-bridge.js' "$UNIT"
if grep -Fq '/srv/academiccloud-compute/current/' "$UNIT"; then
  echo "catalog bridge unit must not use the main worker release selector" >&2
  exit 3
fi

printf 'CATALOG_BRIDGE_RELEASE_VERIFIER=PASS\n'
printf 'SOURCE_COMMIT=%s\n' "$(basename "$RELEASE_ROOT")"
printf 'PADDLE_MANIFEST_SHA256=%s\n' "$(jq -r '.paddle.manifestSha256' "$RELEASE_ROOT/release-manifest.json")"
