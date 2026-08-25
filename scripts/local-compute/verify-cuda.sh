#!/usr/bin/env bash
set -euo pipefail

if (( $# != 1 )); then
  echo "usage: verify-cuda.sh CUDA_SMOKE_SOURCE" >&2
  exit 2
fi

readonly SOURCE="$1"
readonly CUDA_ROOT="/usr/local/cuda-12.8"
readonly WORK_ROOT="/var/lib/academiccloud-compute/tmp"
readonly WORK_DIR="${WORK_ROOT}/cuda-smoke.$$"

test -f "$SOURCE"
test -x "${CUDA_ROOT}/bin/nvcc"
test -c /dev/dxg
test -r /usr/lib/wsl/lib/libcuda.so.1

umask 077
mkdir -p "$WORK_DIR"
cleanup() {
  rm -rf -- "$WORK_DIR"
}
trap cleanup EXIT INT TERM

"${CUDA_ROOT}/bin/nvcc" \
  --std=c++17 \
  --optimize 2 \
  --generate-code arch=compute_89,code=sm_89 \
  "$SOURCE" \
  --output-file "${WORK_DIR}/cuda-smoke"

"${WORK_DIR}/cuda-smoke"
echo "CUDA_SMOKE_SOURCE_SHA256=$(sha256sum "$SOURCE" | awk '{print $1}')"
echo "CUDA_NVCC=$(${CUDA_ROOT}/bin/nvcc --version | tail -n 1)"
