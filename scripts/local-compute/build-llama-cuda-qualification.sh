#!/usr/bin/env bash
set -euo pipefail

if (( $# != 3 )); then
  echo "usage: build-llama-cuda-qualification.sh QUALIFICATION_ROOT SOURCE_ARCHIVE QWEN_MODEL" >&2
  exit 2
fi

readonly QUALIFICATION_ROOT="$1"
readonly SOURCE_ARCHIVE="$2"
readonly QWEN_MODEL="$3"
readonly LLAMA_VERSION="b10218"
readonly LLAMA_BUILD_NUMBER="10218"
readonly LLAMA_REVISION="de69995"
readonly LLAMA_FULL_REVISION="de699957b92f490efebad149665b0dccf127eaff"
readonly SOURCE_SHA256="855de8146555b6f8f93adeda9d35dd1d06e2fb00f60fdf320920e2d01780434d"
readonly QWEN_REVISION="90862c4b9d2787eaed51d12237eafdfe7c5f6077"
readonly QWEN_SHA256="061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a"
readonly CUDA_VERSION="12.8"
readonly CUDA_ARCHITECTURE="89"

[[ "$QUALIFICATION_ROOT" == /* && "$QUALIFICATION_ROOT" != "/" ]]
test -f "$SOURCE_ARCHIVE"
test -f "$QWEN_MODEL"
echo "$SOURCE_SHA256  $SOURCE_ARCHIVE" | sha256sum --check --status
echo "$QWEN_SHA256  $QWEN_MODEL" | sha256sum --check --status
test "$(uname -s)" = "Linux"
test "$(uname -m)" = "x86_64"
test -x "/usr/local/cuda-${CUDA_VERSION}/bin/nvcc"

if [[ -e "$QUALIFICATION_ROOT" ]]; then
  echo "qualification root already exists: $QUALIFICATION_ROOT" >&2
  exit 3
fi

readonly PARENT="$(dirname "$QUALIFICATION_ROOT")"
readonly STAGING="$PARENT/.llama-${LLAMA_VERSION}-cuda.staging.$$"
install -d -m 0750 "$PARENT" "$STAGING/source" "$STAGING/build" "$STAGING/release/bin"
cleanup() {
  rm -rf -- "$STAGING"
}
trap cleanup EXIT

tar -xzf "$SOURCE_ARCHIVE" --strip-components=1 -C "$STAGING/source"
export PATH="/usr/local/cuda-${CUDA_VERSION}/bin:$PATH"
export LD_LIBRARY_PATH="/usr/lib/wsl/lib:/usr/local/cuda-${CUDA_VERSION}/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

cmake \
  -S "$STAGING/source" \
  -B "$STAGING/build" \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_CUDA_COMPILER="/usr/local/cuda-${CUDA_VERSION}/bin/nvcc" \
  -DCMAKE_CUDA_ARCHITECTURES="$CUDA_ARCHITECTURE" \
  -DLLAMA_BUILD_NUMBER="$LLAMA_BUILD_NUMBER" \
  -DLLAMA_BUILD_COMMIT="$LLAMA_REVISION" \
  -DGGML_CUDA=ON \
  -DGGML_NATIVE=ON \
  -DGGML_CCACHE=OFF \
  -DGGML_CUDA_NCCL=OFF \
  -DLLAMA_CURL=OFF \
  -DLLAMA_BUILD_UI=OFF \
  -DLLAMA_USE_PREBUILT_UI=OFF \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_SERVER=ON \
  -DBUILD_SHARED_LIBS=OFF
cmake --build "$STAGING/build" --parallel 2 --target llama-server

readonly BUILT_SERVER="$STAGING/build/bin/llama-server"
test -x "$BUILT_SERVER"
install -m 0750 "$BUILT_SERVER" "$STAGING/release/bin/llama-server"
readonly SERVER="$STAGING/release/bin/llama-server"
readonly SERVER_SHA256="$(sha256sum "$SERVER" | cut -d ' ' -f 1)"
readonly VERSION_OUTPUT="$($SERVER --version 2>&1)"
grep -Fq "$LLAMA_BUILD_NUMBER" <<<"$VERSION_OUTPUT"
grep -Fq "$LLAMA_REVISION" <<<"$VERSION_OUTPUT"
if ldd "$SERVER" | grep -Fq "not found"; then
  ldd "$SERVER" >&2
  exit 4
fi

jq -n \
  --arg llamaVersion "$LLAMA_VERSION" \
  --arg llamaRevision "$LLAMA_REVISION" \
  --arg llamaFullRevision "$LLAMA_FULL_REVISION" \
  --arg sourceSha256 "$SOURCE_SHA256" \
  --arg serverSha256 "$SERVER_SHA256" \
  --arg qwenRevision "$QWEN_REVISION" \
  --arg qwenSha256 "$QWEN_SHA256" \
  --arg cudaVersion "$CUDA_VERSION" \
  --arg cudaArchitecture "$CUDA_ARCHITECTURE" \
  --arg cmake "$(cmake --version | head -n 1)" \
  --arg ninja "$(ninja --version)" \
  --arg nvcc "$(nvcc --version | tail -n 1)" \
  '{
    contractVersion: 1,
    purpose: "local-qualification",
    llama: {
      version: $llamaVersion,
      revision: $llamaRevision,
      fullRevision: $llamaFullRevision,
      sourceArchiveSha256: $sourceSha256,
      serverSha256: $serverSha256
    },
    qwen: {
      name: "Qwen3-1.7B-GGUF",
      revision: $qwenRevision,
      quantization: "Q8_0",
      sha256: $qwenSha256
    },
    acceleration: {
      backend: "CUDA",
      toolkitVersion: $cudaVersion,
      cudaArchitecture: $cudaArchitecture
    },
    buildTools: {cmake: $cmake, ninja: $ninja, nvcc: $nvcc},
    cmakeFlags: [
      "CMAKE_BUILD_TYPE=Release",
      "CMAKE_CUDA_ARCHITECTURES=89",
      "GGML_CUDA=ON",
      "GGML_NATIVE=ON",
      "GGML_CCACHE=OFF",
      "GGML_CUDA_NCCL=OFF",
      "LLAMA_CURL=OFF",
      "LLAMA_BUILD_UI=OFF",
      "LLAMA_USE_PREBUILT_UI=OFF",
      "LLAMA_BUILD_TESTS=OFF",
      "LLAMA_BUILD_EXAMPLES=OFF",
      "LLAMA_BUILD_SERVER=ON",
      "BUILD_SHARED_LIBS=OFF"
    ]
  }' > "$STAGING/release/runtime-manifest.json"
printf '%s\n' "$VERSION_OUTPUT" > "$STAGING/release/llama-version.txt"
ldd "$SERVER" > "$STAGING/release/llama-server.ldd.txt"

mv -- "$STAGING/release" "$QUALIFICATION_ROOT"
trap - EXIT
rm -rf -- "$STAGING"

printf 'LOCAL_LLAMA_CUDA_BUILD=PASS\n'
printf 'LLAMA_SERVER_SHA256=%s\n' "$SERVER_SHA256"
printf '%s\n' "$VERSION_OUTPUT"
