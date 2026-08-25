#!/usr/bin/env bash
set -euo pipefail

test "$(id -un)" = "academiccloud"
test "$(uname -s)" = "Linux"
test "$(uname -m)" = "x86_64"

readonly CACHE_ROOT="/srv/academiccloud-compute/cache/paddle/gpu-dependencies"
readonly INVENTORY="${CACHE_ROOT}/sha256-inventory.txt"
readonly -a PACKAGES=(
  "nvidia-cublas-cu12=12.6.4.1"
  "nvidia-cuda-cccl-cu12=12.6.77"
  "nvidia-cuda-cupti-cu12=12.6.80"
  "nvidia-cuda-nvrtc-cu12=12.6.77"
  "nvidia-cuda-runtime-cu12=12.6.77"
  "nvidia-cudnn-cu12=9.5.1.17"
  "nvidia-cufft-cu12=11.3.0.4"
  "nvidia-cufile-cu12=1.11.1.6"
  "nvidia-curand-cu12=10.3.7.77"
  "nvidia-cusolver-cu12=11.7.1.2"
  "nvidia-cusparse-cu12=12.5.4.2"
  "nvidia-cusparselt-cu12=0.6.3"
  "nvidia-nccl-cu12=2.25.1"
  "nvidia-nvjitlink-cu12=12.6.85"
  "nvidia-nvtx-cu12=12.6.77"
)

umask 027
mkdir -p "$CACHE_ROOT"

download_package() {
  local specification="$1"
  local package="${specification%%=*}"
  local version="${specification#*=}"
  local metadata="${CACHE_ROOT}/${package}-${version}.pypi.json"
  local filename
  local url
  local advertised_sha256

  if [[ ! -f "$metadata" ]]; then
    curl --fail --location --proto '=https' --tlsv1.2 \
      --retry 5 --retry-all-errors \
      --connect-timeout 30 --max-time 60 \
      --output "${metadata}.partial" \
      "https://pypi.org/pypi/${package}/${version}/json"
    mv -f "${metadata}.partial" "$metadata"
  fi

  IFS=$'\t' read -r filename url advertised_sha256 < <(
    jq -r '[.urls[] | select(.packagetype == "bdist_wheel" and (.filename | test("manylinux.*x86_64\\.whl$")))] as $candidates
      | [$candidates[] | select(.filename | endswith(".manylinux_2_17_x86_64.whl"))] as $preferred
      | if ($preferred | length) == 1 then $preferred[0]
        elif ($candidates | length) == 1 then $candidates[0]
        else error("expected one preferred Linux x86_64 wheel") end
      | [.filename, .url, .digests.sha256] | @tsv' "$metadata"
  )
  [[ "$filename" =~ ^[A-Za-z0-9_.-]+\.whl$ ]]
  [[ "$advertised_sha256" =~ ^[0-9a-f]{64}$ ]]
  [[ "$url" == https://files.pythonhosted.org/* ]]

  local destination="${CACHE_ROOT}/${filename}"
  local partial="${destination}.partial"
  if [[ -f "$destination" ]] \
    && printf '%s  %s\n' "$advertised_sha256" "$destination" | sha256sum --check --strict --status; then
    echo "PYPI_WHEEL_REUSED=${filename}"
    return
  fi
  if [[ -f "$destination" ]]; then
    echo "cached wheel digest mismatch: ${filename}" >&2
    exit 1
  fi

  touch "$partial"
  curl --fail --location --proto '=https' --tlsv1.2 \
    --retry 8 --retry-delay 2 --retry-all-errors \
    --connect-timeout 30 --speed-limit 1024 --speed-time 60 \
    --continue-at - \
    --output "$partial" \
    "$url"
  printf '%s  %s\n' "$advertised_sha256" "$partial" | sha256sum --check --strict
  mv -- "$partial" "$destination"
  echo "PYPI_WHEEL_CACHED=${filename}"
}

for specification in "${PACKAGES[@]}"; do
  download_package "$specification"
done

find "$CACHE_ROOT" -maxdepth 1 -type f -name '*.whl' -printf '%f\0' \
  | LC_ALL=C sort -z \
  | while IFS= read -r -d '' filename; do
      printf '%s  %s\n' "$(sha256sum "${CACHE_ROOT}/${filename}" | awk '{print $1}')" "$filename"
    done >"$INVENTORY"
test "$(wc -l <"$INVENTORY")" -eq "${#PACKAGES[@]}"

echo "PADDLE_GPU_DEPENDENCY_WHEELHOUSE=PASS"
echo "PADDLE_GPU_DEPENDENCY_COUNT=${#PACKAGES[@]}"
echo "PADDLE_GPU_DEPENDENCY_INVENTORY_SHA256=$(sha256sum "$INVENTORY" | awk '{print $1}')"
