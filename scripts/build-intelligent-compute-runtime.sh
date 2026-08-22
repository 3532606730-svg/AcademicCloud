#!/usr/bin/env bash
set -euo pipefail

if (( $# != 1 )); then
  echo "usage: build-intelligent-compute-runtime.sh OUTPUT_ROOT" >&2
  exit 2
fi

readonly OUTPUT_ROOT="$1"
readonly PADDLE_VERSION="3.3.1"
readonly PADDLEOCR_VERSION="3.7.0"
readonly PADDLE_WHEEL_SHA256="9016fc497213e1101261684321fbb31ef5960019ef39cb07ded27bc70e2a9858"
readonly PADDLEOCR_WHEEL_SHA256="c0f0a81ad4112727f30c6fcf986ac0ef6a120d31ee0991a01fae0357ee32d338"
readonly DET_REVISION="106c97591b235f607453300d9fc8c1cad1b25488"
readonly DET_SHA256="5043d4ccc8d63402ccea8feefcee4db57077431a873e78d2191836a178a492da"
readonly REC_REVISION="bd619643acac4b9650c040234da8d944476ee3f1"
readonly REC_SHA256="406e1e689c9a7fbb04178007a3fe10cf852afe7bf8bb3bc6dbb9d532b13bd907"
readonly QWEN_REVISION="90862c4b9d2787eaed51d12237eafdfe7c5f6077"
readonly QWEN_SHA256="061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a"
readonly LLAMA_VERSION="b10218"
readonly LLAMA_REVISION="de69995"
readonly LLAMA_ASSET_SHA256="78ec7a1964710918030e85c132a0995b10b07e4f43001bdf54fe0fd48d1eb85b"
readonly QWEN_VL_REVISION="52d6c8ffea26cc873ac5ad116f8631268d7eb503"
readonly QWEN_VL_Q4_SHA256="089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae"
readonly QWEN_VL_MMPROJ_Q8_SHA256="f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82"
readonly DOWNLOAD_ROOT="$OUTPUT_ROOT/downloads"
readonly PADDLE_ROOT="$OUTPUT_ROOT/paddle"

test "$(uname -s)" = "Linux"
test "$(uname -m)" = "x86_64"
python3 -c 'import sys; assert sys.version_info[:2] == (3, 12)'
mkdir -p "$DOWNLOAD_ROOT" "$PADDLE_ROOT/models/PP-OCRv6_small_det" "$PADDLE_ROOT/models/PP-OCRv6_small_rec" "$OUTPUT_ROOT/qwen" "$OUTPUT_ROOT/llama"

python3 -m pip download --disable-pip-version-check --no-deps --only-binary=:all: \
  --dest "$DOWNLOAD_ROOT" "paddlepaddle==$PADDLE_VERSION" "paddleocr==$PADDLEOCR_VERSION"
readonly PADDLE_WHEEL="$(find "$DOWNLOAD_ROOT" -maxdepth 1 -type f -name 'paddlepaddle-3.3.1-cp312-cp312-manylinux1_x86_64.whl' -print -quit)"
readonly PADDLEOCR_WHEEL="$(find "$DOWNLOAD_ROOT" -maxdepth 1 -type f -name 'paddleocr-3.7.0-py3-none-any.whl' -print -quit)"
test -n "$PADDLE_WHEEL"
test -n "$PADDLEOCR_WHEEL"
echo "$PADDLE_WHEEL_SHA256  $PADDLE_WHEEL" | sha256sum --check --status
echo "$PADDLEOCR_WHEEL_SHA256  $PADDLEOCR_WHEEL" | sha256sum --check --status

python3 -m venv "$PADDLE_ROOT/venv"
"$PADDLE_ROOT/venv/bin/python" -m pip install --disable-pip-version-check --no-input "$PADDLE_WHEEL" "$PADDLEOCR_WHEEL"
"$PADDLE_ROOT/venv/bin/python" -m pip check
"$PADDLE_ROOT/venv/bin/python" -m pip freeze --all | LC_ALL=C sort > "$PADDLE_ROOT/requirements-resolved.txt"
readonly RESOLVED_REQUIREMENTS_SHA256="$(sha256sum "$PADDLE_ROOT/requirements-resolved.txt" | cut -d ' ' -f 1)"
cp compute/scripts/paddle_ocr_sidecar.py "$PADDLE_ROOT/paddle_ocr_sidecar.py"

download_model() {
  local repository="$1"
  local revision="$2"
  local destination="$3"
  local filename
  for filename in inference.json inference.pdiparams inference.yml; do
    curl --fail --location --retry 4 --retry-all-errors \
      "https://huggingface.co/PaddlePaddle/$repository/resolve/$revision/$filename?download=true" \
      --output "$destination/$filename"
  done
}

download_model "PP-OCRv6_small_det" "$DET_REVISION" "$PADDLE_ROOT/models/PP-OCRv6_small_det"
download_model "PP-OCRv6_small_rec" "$REC_REVISION" "$PADDLE_ROOT/models/PP-OCRv6_small_rec"
echo "$DET_SHA256  $PADDLE_ROOT/models/PP-OCRv6_small_det/inference.pdiparams" | sha256sum --check --status
echo "$REC_SHA256  $PADDLE_ROOT/models/PP-OCRv6_small_rec/inference.pdiparams" | sha256sum --check --status

curl --fail --location --retry 4 --retry-all-errors \
  "https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/$QWEN_REVISION/Qwen3-1.7B-Q8_0.gguf?download=true" \
  --output "$OUTPUT_ROOT/qwen/Qwen3-1.7B-Q8_0.gguf"
echo "$QWEN_SHA256  $OUTPUT_ROOT/qwen/Qwen3-1.7B-Q8_0.gguf" | sha256sum --check --status

readonly LLAMA_ARCHIVE="$DOWNLOAD_ROOT/llama-$LLAMA_VERSION-bin-ubuntu-x64.tar.gz"
curl --fail --location --retry 4 --retry-all-errors \
  "https://github.com/ggml-org/llama.cpp/releases/download/$LLAMA_VERSION/llama-$LLAMA_VERSION-bin-ubuntu-x64.tar.gz" \
  --output "$LLAMA_ARCHIVE"
echo "$LLAMA_ASSET_SHA256  $LLAMA_ARCHIVE" | sha256sum --check --status
mkdir -p "$DOWNLOAD_ROOT/llama-extracted"
tar -xzf "$LLAMA_ARCHIVE" -C "$DOWNLOAD_ROOT/llama-extracted"
readonly LLAMA_SERVER="$(find "$DOWNLOAD_ROOT/llama-extracted" -type f -name llama-server -print -quit)"
test -n "$LLAMA_SERVER"
mkdir -p "$OUTPUT_ROOT/llama/bin"
cp -a "$(dirname "$LLAMA_SERVER")/." "$OUTPUT_ROOT/llama/bin/"
test -x "$OUTPUT_ROOT/llama/bin/llama-server"

cat > "$OUTPUT_ROOT/runtime-manifest.json" <<EOF
{"contractVersion":1,"paddle":{"version":"$PADDLE_VERSION","wheelSha256":"$PADDLE_WHEEL_SHA256","resolvedRequirementsSha256":"$RESOLVED_REQUIREMENTS_SHA256"},"paddleocr":{"version":"$PADDLEOCR_VERSION","wheelSha256":"$PADDLEOCR_WHEEL_SHA256"},"detectionModel":{"name":"PP-OCRv6_small_det","revision":"$DET_REVISION","sha256":"$DET_SHA256"},"recognitionModel":{"name":"PP-OCRv6_small_rec","revision":"$REC_REVISION","sha256":"$REC_SHA256"},"qwen":{"name":"Qwen3-1.7B-GGUF","revision":"$QWEN_REVISION","quantization":"Q8_0","sha256":"$QWEN_SHA256"},"llama":{"version":"$LLAMA_VERSION","revision":"$LLAMA_REVISION","assetSha256":"$LLAMA_ASSET_SHA256"}}
EOF

if [[ "${INTELLIGENT_COMPARISON_ASSETS:-0}" == "1" ]]; then
  mkdir -p "$OUTPUT_ROOT/comparison/qwen-vl"
  curl --fail --location --retry 4 --retry-all-errors \
    "https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/$QWEN_VL_REVISION/Qwen3VL-2B-Instruct-Q4_K_M.gguf?download=true" \
    --output "$OUTPUT_ROOT/comparison/qwen-vl/Qwen3VL-2B-Instruct-Q4_K_M.gguf"
  curl --fail --location --retry 4 --retry-all-errors \
    "https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/$QWEN_VL_REVISION/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf?download=true" \
    --output "$OUTPUT_ROOT/comparison/qwen-vl/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf"
  echo "$QWEN_VL_Q4_SHA256  $OUTPUT_ROOT/comparison/qwen-vl/Qwen3VL-2B-Instruct-Q4_K_M.gguf" | sha256sum --check --status
  echo "$QWEN_VL_MMPROJ_Q8_SHA256  $OUTPUT_ROOT/comparison/qwen-vl/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf" | sha256sum --check --status
  python3 - "$OUTPUT_ROOT/runtime-manifest.json" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as source:
    manifest = json.load(source)
manifest["qualificationComparison"] = {
    "purpose": "qualification-only-not-production",
    "name": "Qwen3-VL-2B-Instruct-GGUF",
    "revision": "52d6c8ffea26cc873ac5ad116f8631268d7eb503",
    "languageQuantization": "Q4_K_M",
    "languageSha256": "089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae",
    "visionQuantization": "Q8_0",
    "visionSha256": "f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82",
}
with open(path, "w", encoding="utf-8", newline="\n") as destination:
    json.dump(manifest, destination, ensure_ascii=True, separators=(",", ":"))
    destination.write("\n")
PY
fi

rm -rf "$DOWNLOAD_ROOT"
