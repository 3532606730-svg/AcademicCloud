#!/usr/bin/env bash
set -euo pipefail

if (( $# != 2 )); then
  echo "usage: build-paddle-qualification.sh OUTPUT_ROOT SIDECAR_SOURCE" >&2
  exit 2
fi

readonly OUTPUT_ROOT="$1"
readonly SIDECAR_SOURCE="$2"
readonly PADDLE_VERSION="3.3.1"
readonly PADDLEOCR_VERSION="3.7.0"
readonly CPU_WHEEL_NAME="paddlepaddle-3.3.1-cp312-cp312-manylinux1_x86_64.whl"
readonly CPU_WHEEL_SHA256="9016fc497213e1101261684321fbb31ef5960019ef39cb07ded27bc70e2a9858"
readonly GPU_WHEEL_NAME="paddlepaddle_gpu-3.3.1-cp312-cp312-linux_x86_64.whl"
readonly GPU_WHEEL_SHA256="b1500120002c2bf4542c841e25296cf10c52e0d395053aa395f79bd9c0303cce"
readonly PADDLEOCR_WHEEL_NAME="paddleocr-3.7.0-py3-none-any.whl"
readonly PADDLEOCR_WHEEL_SHA256="c0f0a81ad4112727f30c6fcf986ac0ef6a120d31ee0991a01fae0357ee32d338"
readonly DET_REVISION="106c97591b235f607453300d9fc8c1cad1b25488"
readonly DET_SHA256="5043d4ccc8d63402ccea8feefcee4db57077431a873e78d2191836a178a492da"
readonly REC_REVISION="bd619643acac4b9650c040234da8d944476ee3f1"
readonly REC_SHA256="406e1e689c9a7fbb04178007a3fe10cf852afe7bf8bb3bc6dbb9d532b13bd907"
readonly CACHE_ROOT="/srv/academiccloud-compute/cache/paddle"
readonly WHEEL_ROOT="${CACHE_ROOT}/wheels"
readonly GPU_WHEEL_SOURCE="${CACHE_ROOT}/wheels-gpu/${GPU_WHEEL_NAME}"
readonly GPU_DEPENDENCY_ROOT="${CACHE_ROOT}/gpu-dependencies"
readonly MODEL_CACHE="${CACHE_ROOT}/models"
readonly -a GPU_DEPENDENCIES=(
  "nvidia-cublas-cu12==12.6.4.1"
  "nvidia-cuda-cccl-cu12==12.6.77"
  "nvidia-cuda-cupti-cu12==12.6.80"
  "nvidia-cuda-nvrtc-cu12==12.6.77"
  "nvidia-cuda-runtime-cu12==12.6.77"
  "nvidia-cudnn-cu12==9.5.1.17"
  "nvidia-cufft-cu12==11.3.0.4"
  "nvidia-cufile-cu12==1.11.1.6"
  "nvidia-curand-cu12==10.3.7.77"
  "nvidia-cusolver-cu12==11.7.1.2"
  "nvidia-cusparse-cu12==12.5.4.2"
  "nvidia-cusparselt-cu12==0.6.3"
  "nvidia-nccl-cu12==2.25.1"
  "nvidia-nvjitlink-cu12==12.6.85"
  "nvidia-nvtx-cu12==12.6.77"
)

test "$(uname -s)" = "Linux"
test "$(uname -m)" = "x86_64"
python3 -c 'import sys; assert sys.version_info[:2] == (3, 12)'
test -f "$SIDECAR_SOURCE"
test "$(id -un)" = "academiccloud"

umask 027
mkdir -p "$OUTPUT_ROOT" "$WHEEL_ROOT" "$MODEL_CACHE" "${CACHE_ROOT}/pip"
export PIP_CACHE_DIR="${CACHE_ROOT}/pip"
export PIP_DEFAULT_TIMEOUT="300"
export PIP_RETRIES="5"

python3 -m pip download --disable-pip-version-check --no-deps --only-binary=:all: \
  --dest "$WHEEL_ROOT" \
  "paddlepaddle==${PADDLE_VERSION}" "paddleocr==${PADDLEOCR_VERSION}"

readonly CPU_WHEEL="${WHEEL_ROOT}/${CPU_WHEEL_NAME}"
readonly PADDLEOCR_WHEEL="${WHEEL_ROOT}/${PADDLEOCR_WHEEL_NAME}"
test -f "$CPU_WHEEL"
test -f "$GPU_WHEEL_SOURCE"
test -f "$PADDLEOCR_WHEEL"
printf '%s  %s\n' "$CPU_WHEEL_SHA256" "$CPU_WHEEL" | sha256sum --check --strict
printf '%s  %s\n' "$GPU_WHEEL_SHA256" "$GPU_WHEEL_SOURCE" | sha256sum --check --strict
printf '%s  %s\n' "$PADDLEOCR_WHEEL_SHA256" "$PADDLEOCR_WHEEL" | sha256sum --check --strict

download_model() {
  local repository="$1"
  local revision="$2"
  local destination="${MODEL_CACHE}/${repository}"
  local filename
  mkdir -p "$destination"
  for filename in inference.json inference.pdiparams inference.yml; do
    if [[ ! -f "${destination}/${filename}" ]]; then
      curl --fail --location --proto '=https' --tlsv1.2 \
        --retry 4 --retry-all-errors \
        --output "${destination}/${filename}.partial" \
        "https://huggingface.co/PaddlePaddle/${repository}/resolve/${revision}/${filename}?download=true"
      mv -f "${destination}/${filename}.partial" "${destination}/${filename}"
    fi
  done
}

download_model "PP-OCRv6_small_det" "$DET_REVISION"
download_model "PP-OCRv6_small_rec" "$REC_REVISION"
printf '%s  %s\n' "$DET_SHA256" "${MODEL_CACHE}/PP-OCRv6_small_det/inference.pdiparams" | sha256sum --check --strict
printf '%s  %s\n' "$REC_SHA256" "${MODEL_CACHE}/PP-OCRv6_small_rec/inference.pdiparams" | sha256sum --check --strict

find "$MODEL_CACHE" -mindepth 2 -maxdepth 2 -type f -printf '%P\0' \
  | LC_ALL=C sort -z \
  | while IFS= read -r -d '' path; do
      printf '%s  %s\n' "$(sha256sum "${MODEL_CACHE}/${path}" | awk '{print $1}')" "$path"
    done >"${OUTPUT_ROOT}/model-files.sha256"
readonly MODEL_INVENTORY_SHA256="$(sha256sum "${OUTPUT_ROOT}/model-files.sha256" | awk '{print $1}')"

verify_backend() {
  local python="$1"
  local backend="$2"
  "$python" -I - "$backend" <<'PY'
import sys
import paddle
import paddleocr

backend = sys.argv[1]
assert paddle.__version__ == "3.3.1"
assert paddleocr.__version__ == "3.7.0"
assert paddle.is_compiled_with_cuda() is (backend == "gpu")
paddle.set_device("gpu:0" if backend == "gpu" else "cpu")
value = paddle.to_tensor([1.0, 2.0, 3.0])
result = (value * 4.0 + 2.0).numpy().tolist()
assert result == [6.0, 10.0, 14.0]
print(f"PADDLE_{backend.upper()}_TENSOR_EXECUTION=PASS")
print(f"PADDLE_DEVICE={paddle.device.get_device()}")
PY
}

install_backend() {
  local backend="$1"
  local wheel="$2"
  local wheel_sha256="$3"
  local stage="${OUTPUT_ROOT}/.${backend}.staging.$$"
  local target="${OUTPUT_ROOT}/${backend}"

  if [[ "$backend" = "gpu" ]]; then
    test -f "${GPU_DEPENDENCY_ROOT}/sha256-inventory.txt"
    test "$(wc -l <"${GPU_DEPENDENCY_ROOT}/sha256-inventory.txt")" -eq 15
  fi

  if [[ -f "${target}/runtime-manifest.json" ]] \
    && [[ "$(jq -r '.backend' "${target}/runtime-manifest.json")" = "$backend" ]] \
    && [[ "$(jq -r '.paddle.wheelSha256' "${target}/runtime-manifest.json")" = "$wheel_sha256" ]] \
    && [[ "$(sha256sum "${target}/requirements-resolved.txt" | awk '{print $1}')" = "$(jq -r '.resolvedRequirementsSha256' "${target}/runtime-manifest.json")" ]]; then
    verify_backend "${target}/venv/bin/python" "$backend"
    echo "PADDLE_${backend^^}_ENVIRONMENT_REUSED=true"
    return
  fi

  rm -rf -- "$stage"
  python3 -m venv "$stage/venv"
  if [[ "$backend" = "gpu" ]]; then
    "${stage}/venv/bin/python" -m pip install --disable-pip-version-check --no-input \
      --no-index --find-links "$GPU_DEPENDENCY_ROOT" \
      "${GPU_DEPENDENCIES[@]}"
  fi
  "${stage}/venv/bin/python" -m pip install --disable-pip-version-check --no-input \
    --timeout "$PIP_DEFAULT_TIMEOUT" --retries "$PIP_RETRIES" \
    "$wheel" "$PADDLEOCR_WHEEL"
  "${stage}/venv/bin/python" -m pip check
  verify_backend "${stage}/venv/bin/python" "$backend"
  "${stage}/venv/bin/python" -m pip freeze --all | LC_ALL=C sort >"${stage}/requirements-resolved.txt"
  local requirements_sha256
  requirements_sha256="$(sha256sum "${stage}/requirements-resolved.txt" | awk '{print $1}')"
  install -m 0644 "$SIDECAR_SOURCE" "${stage}/paddle_ocr_sidecar.py"
  cp -a "$MODEL_CACHE" "${stage}/models"
  jq --null-input \
    --arg backend "$backend" \
    --arg paddleVersion "$PADDLE_VERSION" \
    --arg paddleWheelSha256 "$wheel_sha256" \
    --arg paddleOcrVersion "$PADDLEOCR_VERSION" \
    --arg paddleOcrWheelSha256 "$PADDLEOCR_WHEEL_SHA256" \
    --arg resolvedRequirementsSha256 "$requirements_sha256" \
    --arg modelInventorySha256 "$MODEL_INVENTORY_SHA256" \
    --arg detectionRevision "$DET_REVISION" \
    --arg detectionSha256 "$DET_SHA256" \
    --arg recognitionRevision "$REC_REVISION" \
    --arg recognitionSha256 "$REC_SHA256" \
    '{contractVersion: 1, purpose: "local-qualification", backend: $backend, paddle: {version: $paddleVersion, wheelSha256: $paddleWheelSha256}, paddleocr: {version: $paddleOcrVersion, wheelSha256: $paddleOcrWheelSha256}, resolvedRequirementsSha256: $resolvedRequirementsSha256, modelInventorySha256: $modelInventorySha256, detectionModel: {revision: $detectionRevision, sha256: $detectionSha256}, recognitionModel: {revision: $recognitionRevision, sha256: $recognitionSha256}}' \
    >"${stage}/runtime-manifest.json"
  rm -rf -- "$target"
  mv -- "$stage" "$target"
}

install_backend cpu "$CPU_WHEEL" "$CPU_WHEEL_SHA256"
install_backend gpu "$GPU_WHEEL_SOURCE" "$GPU_WHEEL_SHA256"

echo "LOCAL_PADDLE_CPU_ENVIRONMENT=PASS"
echo "LOCAL_PADDLE_GPU_ENVIRONMENT=PASS"
echo "PADDLE_MODEL_INVENTORY_SHA256=${MODEL_INVENTORY_SHA256}"
