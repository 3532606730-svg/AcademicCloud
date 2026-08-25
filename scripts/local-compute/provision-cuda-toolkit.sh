#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
  echo "provision-cuda-toolkit.sh must run as root" >&2
  exit 2
fi

test "$({ . /etc/os-release; printf '%s' "$ID"; })" = "ubuntu"
test "$({ . /etc/os-release; printf '%s' "$VERSION_ID"; })" = "24.04"
grep -qi microsoft /proc/sys/kernel/osrelease

readonly KEYRING_VERSION="1.1-1"
readonly KEYRING_FILE="cuda-keyring_${KEYRING_VERSION}_all.deb"
readonly KEYRING_SHA256="eea6cc5f0eaeb99082d054b8c05ae206a378e31e88048df0310d59f651dceed2"
readonly KEYRING_URL="https://developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/${KEYRING_FILE}"
readonly CUDA_PACKAGE="cuda-toolkit-12-8"
readonly CUDA_PACKAGE_VERSION="12.8.2-1"
readonly CACHE_ROOT="/srv/academiccloud-compute/cache/cuda"
readonly MANIFEST_ROOT="/opt/academiccloud-compute/runtime-manifests"

install -d -o academiccloud -g academiccloud -m 0750 "$CACHE_ROOT"
install -d -o root -g root -m 0755 "$MANIFEST_ROOT"

if [[ ! -f "${CACHE_ROOT}/${KEYRING_FILE}" ]]; then
  curl --fail --location --proto '=https' --tlsv1.2 \
    --retry 4 --retry-all-errors \
    --output "${CACHE_ROOT}/${KEYRING_FILE}.partial" \
    "$KEYRING_URL"
  mv -f "${CACHE_ROOT}/${KEYRING_FILE}.partial" "${CACHE_ROOT}/${KEYRING_FILE}"
fi

printf '%s  %s\n' "$KEYRING_SHA256" "${CACHE_ROOT}/${KEYRING_FILE}" | sha256sum --check --strict
dpkg --install "${CACHE_ROOT}/${KEYRING_FILE}"

export DEBIAN_FRONTEND=noninteractive
apt-get update

if ! apt-cache madison "$CUDA_PACKAGE" | awk '{print $3}' | grep -Fxq "$CUDA_PACKAGE_VERSION"; then
  echo "pinned ${CUDA_PACKAGE}=${CUDA_PACKAGE_VERSION} is unavailable" >&2
  exit 1
fi

apt-get install -y --no-install-recommends "${CUDA_PACKAGE}=${CUDA_PACKAGE_VERSION}"
test "$(dpkg-query -W -f='${Version}' "$CUDA_PACKAGE")" = "$CUDA_PACKAGE_VERSION"
test -x /usr/local/cuda-12.8/bin/nvcc

dpkg-query -W -f='${binary:Package}\t${Version}\n' \
  'cuda-*' 'libcu*' 'nsight-*' 2>/dev/null \
  | LC_ALL=C sort -u >"${MANIFEST_ROOT}/cuda-12.8-packages.txt"

readonly PACKAGE_MANIFEST_SHA256="$(sha256sum "${MANIFEST_ROOT}/cuda-12.8-packages.txt" | awk '{print $1}')"
jq --null-input \
  --arg toolkitPackage "$CUDA_PACKAGE" \
  --arg toolkitPackageVersion "$CUDA_PACKAGE_VERSION" \
  --arg keyringVersion "$KEYRING_VERSION" \
  --arg keyringSha256 "$KEYRING_SHA256" \
  --arg packageManifestSha256 "$PACKAGE_MANIFEST_SHA256" \
  --arg nvccVersion "$(/usr/local/cuda-12.8/bin/nvcc --version | tail -n 1)" \
  '{toolkitPackage: $toolkitPackage, toolkitPackageVersion: $toolkitPackageVersion, keyringVersion: $keyringVersion, keyringSha256: $keyringSha256, packageManifestSha256: $packageManifestSha256, nvccVersion: $nvccVersion, linuxDisplayDriverInstalled: false}' \
  >"${MANIFEST_ROOT}/cuda-12.8.json"
chmod 0644 "${MANIFEST_ROOT}/cuda-12.8.json" "${MANIFEST_ROOT}/cuda-12.8-packages.txt"

echo "LOCAL_CUDA_TOOLKIT_IDENTITY=PASS"
echo "CUDA_TOOLKIT_PACKAGE=${CUDA_PACKAGE}=${CUDA_PACKAGE_VERSION}"
echo "CUDA_PACKAGE_MANIFEST_SHA256=${PACKAGE_MANIFEST_SHA256}"
