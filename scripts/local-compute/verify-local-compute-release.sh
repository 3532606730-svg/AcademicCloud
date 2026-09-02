#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 || $# != 1 )); then
  echo "usage (as root): verify-local-compute-release.sh RELEASE_ROOT" >&2
  exit 2
fi

readonly RELEASE_ROOT="$1"
readonly COMPUTE_ROOT="/srv/academiccloud-compute"
readonly MODEL_PATH="${COMPUTE_ROOT}/models/numind/NuExtract3-GGUF/28a1aae6288c5d50bdf999ca2e572240966d669b/NuExtract3-Q5_K_M.gguf"
readonly MODEL_MANIFEST="$(dirname "$MODEL_PATH")/asset-manifest.json"
readonly MODEL_SHA256="1e6792f3402347785eb54e965255329e96204233b4bbf717c67a99f267736383"
readonly MODEL_BYTE_SIZE="3161424864"

[[ "$RELEASE_ROOT" =~ ^${COMPUTE_ROOT}/releases/[a-f0-9]{40}$ ]]
test -d "$RELEASE_ROOT"
test -f "$RELEASE_ROOT/release-manifest.json"
test -f "$RELEASE_ROOT/release-files.sha256"
test -f "$RELEASE_ROOT/release-files.sha256.sha256"
test -x "$RELEASE_ROOT/runtime/node/bin/node"
test -x "$RELEASE_ROOT/runtime/llama/bin/llama-server"
test -x "$RELEASE_ROOT/runtime/paddle/venv/bin/python"
test "$(stat -c '%U:%G|%a' "$RELEASE_ROOT")" = "root:root|555"
test -z "$(find "$RELEASE_ROOT" -xdev \( -type f -o -type d \) -perm /022 -print -quit)"
test "$(jq -r '.contractVersion' "$RELEASE_ROOT/release-manifest.json")" = "2"
test "$(jq -r '.provider' "$RELEASE_ROOT/release-manifest.json")" = "local_pull"
test "$(jq -r '.source.commit' "$RELEASE_ROOT/release-manifest.json")" = "$(basename "$RELEASE_ROOT")"
test "$(jq -r '.reasoningModel.family' "$RELEASE_ROOT/release-manifest.json")" = "NuExtract3"
test "$(jq -r '.reasoningModel.identity' "$RELEASE_ROOT/release-manifest.json")" = "NuExtract3-4B"
test "$(jq -r '.reasoningModel.architecture' "$RELEASE_ROOT/release-manifest.json")" = "qwen35"
test "$(jq -r '.reasoningModel.repository' "$RELEASE_ROOT/release-manifest.json")" = "numind/NuExtract3-GGUF"
test "$(jq -r '.reasoningModel.revision' "$RELEASE_ROOT/release-manifest.json")" = "28a1aae6288c5d50bdf999ca2e572240966d669b"
test "$(jq -r '.reasoningModel.filename' "$RELEASE_ROOT/release-manifest.json")" = "NuExtract3-Q5_K_M.gguf"
test "$(jq -r '.reasoningModel.quantization' "$RELEASE_ROOT/release-manifest.json")" = "Q5_K_M"
test "$(jq -r '.reasoningModel.byteSize' "$RELEASE_ROOT/release-manifest.json")" = "$MODEL_BYTE_SIZE"
test "$(jq -r '.reasoningModel.sha256' "$RELEASE_ROOT/release-manifest.json")" = "$MODEL_SHA256"
test "$(jq -r '.reasoningModel.shared' "$RELEASE_ROOT/release-manifest.json")" = "true"
test "$(jq -r '.reasoningModel.path' "$RELEASE_ROOT/release-manifest.json")" = "$MODEL_PATH"
printf '%s  %s\n' "$(cat "$RELEASE_ROOT/release-files.sha256.sha256")" "$RELEASE_ROOT/release-files.sha256" \
  | sha256sum --check --strict
(
  cd "$RELEASE_ROOT"
  sha256sum --check --strict release-files.sha256 >/dev/null
)

test -f "$MODEL_PATH"
test -f "$MODEL_MANIFEST"
test "$(stat -c '%U:%G|%a|%s' "$MODEL_PATH")" = "root:academiccloud|440|${MODEL_BYTE_SIZE}"
test "$(jq -r '.model.repository' "$MODEL_MANIFEST")" = "numind/NuExtract3-GGUF"
test "$(jq -r '.model.revision' "$MODEL_MANIFEST")" = "28a1aae6288c5d50bdf999ca2e572240966d669b"
test "$(jq -r '.model.filename' "$MODEL_MANIFEST")" = "NuExtract3-Q5_K_M.gguf"
test "$(jq -r '.model.sha256' "$MODEL_MANIFEST")" = "$MODEL_SHA256"
test "$(jq -r '.model.byteSize' "$MODEL_MANIFEST")" = "$MODEL_BYTE_SIZE"
test "$(jq -r '.model.quantization' "$MODEL_MANIFEST")" = "Q5_K_M"
test "$(jq -r '.model.architecture' "$MODEL_MANIFEST")" = "qwen35"
printf '%s  %s\n' "$MODEL_SHA256" "$MODEL_PATH" | sha256sum --check --strict

printf 'LOCAL_COMPUTE_RELEASE_VERIFIER=PASS\n'
printf 'SOURCE_COMMIT=%s\n' "$(basename "$RELEASE_ROOT")"
printf 'MODEL_SHA256=%s\n' "$MODEL_SHA256"
