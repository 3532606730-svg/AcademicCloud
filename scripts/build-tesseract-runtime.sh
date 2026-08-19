#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${1:-}" == "" || "${1:-}" == /* || "${1:-}" == *".."* ]]; then
  echo "usage: build-tesseract-runtime.sh <repository-relative-output>" >&2
  exit 2
fi

readonly REPOSITORY_ROOT="/work"
readonly OUTPUT_ROOT="${REPOSITORY_ROOT}/${1}"
readonly BUILDER_IMAGE_EXPECTED="ubuntu@sha256:1e0a86e57d247923571b75e0aaf48a1449cf8c543d51fb3e07a4a7d7bfa79316"
readonly APT_SNAPSHOT="20260818T000000Z"
readonly TESSERACT_TAG="5.5.3"
readonly TESSERACT_TAG_OBJECT="6951ffe10ce031374bcd04fe400811da1e7e04ad"
readonly TESSERACT_COMMIT="db0ec62f81b0737fbbe184d8fea40af5738f8eef"
readonly TESSERACT_SOURCE_URL="https://github.com/tesseract-ocr/tesseract/archive/refs/tags/5.5.3.tar.gz"
readonly TESSERACT_SOURCE_SHA256="9218e62793116d42a9f6d14cd9348518b27f382096eea3d0f2d1a24616bb5884"
readonly TESSDATA_TAG="4.1.0"
readonly TESSDATA_TAG_OBJECT="a8ba5063ab8013372a20e300da0c97ee46b92b07"
readonly TESSDATA_COMMIT="65727574dfcd264acbb0c3e07860e4e9e9b22185"
readonly SOURCE_DATE_EPOCH_VALUE="1784917766"
readonly WORK_ROOT="/tmp/academiccloud-tesseract-5.5.3"
readonly SOURCE_ARCHIVE="${WORK_ROOT}/tesseract-5.5.3.tar.gz"
readonly SOURCE_ROOT="${WORK_ROOT}/source"
readonly BUILD_ROOT="${WORK_ROOT}/build"
readonly INSTALL_ROOT="${WORK_ROOT}/install"
readonly SNAPSHOT_CA_BOOTSTRAP_CONFIG="/etc/apt/apt.conf.d/49academiccloud-snapshot-ca-bootstrap"

declare -Ar MODEL_SHA256=(
  [eng]="7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"
  [chi_sim]="a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730"
  [chi_tra]="529c5b5797d64b126065cd55f2bb4c7fd7b15790798091b1ff259941a829330b"
)
readonly LICENSE_SHA256="cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"

if [[ "${TESSERACT_BUILDER_IMAGE:-}" != "${BUILDER_IMAGE_EXPECTED}" ]]; then
  echo "unexpected Tesseract builder image identity" >&2
  exit 3
fi
if [[ -z "${GITHUB_API_TOKEN:-}" ]]; then
  echo "GitHub API token is required for pinned tag-signature verification" >&2
  exit 3
fi
if [[ ! "${ARTIFACT_OUTPUT_UID:-}" =~ ^[1-9][0-9]*$ || ! "${ARTIFACT_OUTPUT_GID:-}" =~ ^[1-9][0-9]*$ ]]; then
  echo "non-root artifact output UID/GID are required" >&2
  exit 3
fi
if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "Tesseract runtime must be built on Linux x86_64" >&2
  exit 3
fi
if [[ "$(realpath -m "${OUTPUT_ROOT}")" != "${OUTPUT_ROOT}" || "${OUTPUT_ROOT}" != "${REPOSITORY_ROOT}/output/"* ]]; then
  echo "Tesseract output must be a normalized path below repository output" >&2
  exit 3
fi

export DEBIAN_FRONTEND=noninteractive
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
export TZ=UTC
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH_VALUE}"

github_api_get() {
  local url="$1"
  local output="$2"
  curl --fail --show-error --silent --location \
    --retry 4 --retry-all-errors --retry-delay 2 \
    --proto '=https' --tlsv1.2 \
    --header "Authorization: Bearer ${GITHUB_API_TOKEN}" \
    --header 'X-GitHub-Api-Version: 2022-11-28' \
    "${url}" \
    --output "${output}"
}

echo "APT::Snapshot \"${APT_SNAPSHOT}\";" > /etc/apt/apt.conf.d/50academiccloud-snapshot
# The digest-pinned minimal Ubuntu image intentionally has no CA bundle. APT's
# signed InRelease metadata still authenticates this first snapshot-only
# bootstrap; the temporary TLS exception is removed immediately after the exact
# snapshot ca-certificates package is installed. Delete every bootstrap index
# and require a normal certificate-verified snapshot refresh before installing
# any build dependency.
echo 'Acquire::https::Verify-Peer "false";' > "${SNAPSHOT_CA_BOOTSTRAP_CONFIG}"
apt-get update
apt-get install -y --no-install-recommends ca-certificates
rm -f "${SNAPSHOT_CA_BOOTSTRAP_CONFIG}"
rm -rf /var/lib/apt/lists/*
apt-get update
apt-get install -y --no-install-recommends \
  binutils \
  build-essential \
  ca-certificates \
  cmake \
  curl \
  file \
  jq \
  libleptonica-dev \
  ninja-build \
  patchelf \
  pkg-config
rm -rf /var/lib/apt/lists/*

rm -rf "${WORK_ROOT}" "${OUTPUT_ROOT}"
mkdir -p "${WORK_ROOT}" "${SOURCE_ROOT}" "${BUILD_ROOT}" "${INSTALL_ROOT}"
mkdir -p "${OUTPUT_ROOT}/bin" "${OUTPUT_ROOT}/lib" "${OUTPUT_ROOT}/tessdata/configs" "${OUTPUT_ROOT}/licenses/ubuntu-packages"

github_api_get \
  "https://api.github.com/repos/tesseract-ocr/tesseract/git/tags/${TESSERACT_TAG_OBJECT}" \
  "${WORK_ROOT}/tesseract-tag.json"
jq -e \
  --arg commit "${TESSERACT_COMMIT}" \
  '.object.type == "commit" and .object.sha == $commit and .verification.verified == true and .verification.reason == "valid"' \
  "${WORK_ROOT}/tesseract-tag.json" >/dev/null

curl --fail --show-error --silent --location \
  --proto '=https' --tlsv1.2 \
  "${TESSERACT_SOURCE_URL}" \
  --output "${SOURCE_ARCHIVE}"
echo "${TESSERACT_SOURCE_SHA256}  ${SOURCE_ARCHIVE}" | sha256sum --check --strict
tar --extract --gzip --file "${SOURCE_ARCHIVE}" --directory "${SOURCE_ROOT}" --strip-components=1
[[ "$(cat "${SOURCE_ROOT}/VERSION")" == "${TESSERACT_TAG}" ]]

github_api_get \
  "https://api.github.com/repos/tesseract-ocr/tessdata_fast/git/tags/${TESSDATA_TAG_OBJECT}" \
  "${WORK_ROOT}/tessdata-tag.json"
jq -e \
  --arg commit "${TESSDATA_COMMIT}" \
  '.object.type == "commit" and .object.sha == $commit and .verification.verified == true and .verification.reason == "valid"' \
  "${WORK_ROOT}/tessdata-tag.json" >/dev/null

for language in eng chi_sim chi_tra; do
  model="${OUTPUT_ROOT}/tessdata/${language}.traineddata"
  curl --fail --show-error --silent --location \
    --proto '=https' --tlsv1.2 \
    "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${TESSDATA_COMMIT}/${language}.traineddata" \
    --output "${model}"
  echo "${MODEL_SHA256[${language}]}  ${model}" | sha256sum --check --strict
done

cp "${SOURCE_ROOT}/tessdata/configs/tsv" "${OUTPUT_ROOT}/tessdata/configs/tsv"
cp "${SOURCE_ROOT}/LICENSE" "${OUTPUT_ROOT}/licenses/tesseract-LICENSE"
echo "${LICENSE_SHA256}  ${OUTPUT_ROOT}/licenses/tesseract-LICENSE" | sha256sum --check --strict
curl --fail --show-error --silent --location \
  --proto '=https' --tlsv1.2 \
  "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${TESSDATA_COMMIT}/LICENSE" \
  --output "${OUTPUT_ROOT}/licenses/tessdata_fast-LICENSE"
echo "${LICENSE_SHA256}  ${OUTPUT_ROOT}/licenses/tessdata_fast-LICENSE" | sha256sum --check --strict

readonly REPRODUCIBLE_FLAGS="-O2 -g0 -ffile-prefix-map=${WORK_ROOT}=. -fdebug-prefix-map=${WORK_ROOT}=."
cmake \
  -S "${SOURCE_ROOT}" \
  -B "${BUILD_ROOT}" \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="${INSTALL_ROOT}" \
  -DCMAKE_INSTALL_LIBDIR=lib \
  -DCMAKE_C_FLAGS="${REPRODUCIBLE_FLAGS}" \
  -DCMAKE_CXX_FLAGS="${REPRODUCIBLE_FLAGS}" \
  -DBUILD_SHARED_LIBS=ON \
  -DBUILD_TESTS=OFF \
  -DBUILD_TRAINING_TOOLS=OFF \
  -DDISABLED_LEGACY_ENGINE=ON \
  -DDISABLE_ARCHIVE=ON \
  -DDISABLE_CURL=ON \
  -DDISABLE_TIFF=ON \
  -DENABLE_CCACHE=OFF \
  -DENABLE_LTO=OFF \
  -DENABLE_NATIVE=OFF \
  -DENABLE_PRECOMPILED_HEADERS=OFF \
  -DGRAPHICS_DISABLED=ON \
  -DINSTALL_CONFIGS=OFF \
  -DOPENMP_BUILD=OFF
cmake --build "${BUILD_ROOT}" --parallel 2
cmake --install "${BUILD_ROOT}"

cp "${INSTALL_ROOT}/bin/tesseract" "${OUTPUT_ROOT}/bin/tesseract"
chmod 0755 "${OUTPUT_ROOT}/bin/tesseract"

declare -Ar BASELINE_LIBRARIES=(
  [ld-linux-x86-64.so.2]=1
  [libc.so.6]=1
  [libdl.so.2]=1
  [libm.so.6]=1
  [libpthread.so.0]=1
  [librt.so.1]=1
  [linux-vdso.so.1]=1
)
declare -A SCANNED=()
declare -A COPIED_SOURCE=()
declare -A RUNTIME_PACKAGES=()
declare -a QUEUE_FILES=("${OUTPUT_ROOT}/bin/tesseract")
declare -a QUEUE_SOURCES=("${INSTALL_ROOT}/bin/tesseract")

copy_dependency() {
  local name="$1"
  local source="$2"
  local destination="${OUTPUT_ROOT}/lib/${name}"
  local resolved
  resolved="$(readlink -f "${source}")"
  [[ -f "${resolved}" ]] || { echo "missing dependency source: ${source}" >&2; exit 4; }
  if [[ -f "${destination}" ]]; then
    [[ "$(sha256sum "${destination}" | cut -d' ' -f1)" == "$(sha256sum "${resolved}" | cut -d' ' -f1)" ]] || {
      echo "conflicting dependency basename: ${name}" >&2
      exit 4
    }
  else
    cp --dereference "${resolved}" "${destination}"
    chmod 0644 "${destination}"
    QUEUE_FILES+=("${destination}")
    QUEUE_SOURCES+=("${resolved}")
    COPIED_SOURCE["${destination}"]="${resolved}"
  fi
  local package
  package="$(dpkg-query --search "${resolved}" 2>/dev/null | head -n1 | cut -d: -f1 || true)"
  if [[ -n "${package}" ]]; then
    RUNTIME_PACKAGES["${package}"]=1
  fi
}

index=0
while (( index < ${#QUEUE_FILES[@]} )); do
  file_path="${QUEUE_FILES[${index}]}"
  source_path="${QUEUE_SOURCES[${index}]}"
  ((index+=1))
  scan_key="$(readlink -f "${source_path}")"
  [[ -n "${SCANNED[${scan_key}]:-}" ]] && continue
  SCANNED["${scan_key}"]=1
  while IFS= read -r line; do
    [[ "${line}" == *"not found"* ]] && { echo "unresolved build dependency: ${line}" >&2; exit 4; }
    name=""
    path=""
    if [[ "${line}" =~ ^[[:space:]]*([^[:space:]]+)[[:space:]]+\=\>[[:space:]]+(/[^[:space:]]+) ]]; then
      name="${BASH_REMATCH[1]}"
      path="${BASH_REMATCH[2]}"
    elif [[ "${line}" =~ ^[[:space:]]*(/[^[:space:]]+) ]]; then
      path="${BASH_REMATCH[1]}"
      name="$(basename "${path}")"
    elif [[ "${line}" =~ ^[[:space:]]*(linux-vdso\.so\.1) ]]; then
      name="${BASH_REMATCH[1]}"
    fi
    [[ -z "${name}" || -n "${BASELINE_LIBRARIES[${name}]:-}" ]] && continue
    [[ -n "${path}" ]] || { echo "unresolved dependency metadata: ${line}" >&2; exit 4; }
    copy_dependency "${name}" "${path}"
  done < <(LD_LIBRARY_PATH="${INSTALL_ROOT}/lib:${OUTPUT_ROOT}/lib" ldd "${source_path}")
done

patchelf --set-rpath '$ORIGIN/../lib' "${OUTPUT_ROOT}/bin/tesseract"
for library in "${OUTPUT_ROOT}"/lib/*; do
  patchelf --set-rpath '$ORIGIN' "${library}"
done

while IFS= read -r line; do
  [[ "${line}" == *"not found"* ]] && { echo "unresolved packaged dependency: ${line}" >&2; exit 4; }
  if [[ "${line}" =~ ^[[:space:]]*([^[:space:]]+)[[:space:]]+\=\>[[:space:]]+(/[^[:space:]]+) ]]; then
    name="${BASH_REMATCH[1]}"
    path="${BASH_REMATCH[2]}"
    if [[ -z "${BASELINE_LIBRARIES[${name}]:-}" && "${path}" != "${OUTPUT_ROOT}/lib/"* ]]; then
      echo "packaged dependency escaped release-local closure: ${line}" >&2
      exit 4
    fi
  fi
done < <(LD_LIBRARY_PATH="${OUTPUT_ROOT}/lib" ldd "${OUTPUT_ROOT}/bin/tesseract")

for package in "${!RUNTIME_PACKAGES[@]}"; do
  notice="/usr/share/doc/${package}/copyright"
  if [[ -f "${notice}" ]]; then
    cp "${notice}" "${OUTPUT_ROOT}/licenses/ubuntu-packages/${package}.copyright"
  fi
done

build_packages_json="$(
  dpkg-query --show --showformat='${binary:Package}\t${Version}\n' \
    binutils build-essential ca-certificates cmake curl file jq libleptonica-dev ninja-build patchelf pkg-config \
    | sort -u \
    | jq --raw-input --slurp 'split("\n") | map(select(length > 0) | split("\t") | {name: .[0], version: .[1]})'
)"
runtime_packages_json="$(
  for package in "${!RUNTIME_PACKAGES[@]}"; do
    dpkg-query --show --showformat='${binary:Package}\t${Version}\n' "${package}"
  done \
    | sort -u \
    | jq --raw-input --slurp 'split("\n") | map(select(length > 0) | split("\t") | {name: .[0], version: .[1]})'
)"

jq --null-input \
  --arg builderImage "${BUILDER_IMAGE_EXPECTED}" \
  --arg aptSnapshot "${APT_SNAPSHOT}" \
  --arg osRelease "$(. /etc/os-release; printf '%s %s' "${ID}" "${VERSION_ID}")" \
  --arg architecture "$(dpkg --print-architecture)" \
  --arg compiler "$(g++ --version | head -n1)" \
  --arg cmake "$(cmake --version | head -n1)" \
  --arg ninja "$(ninja --version)" \
  --arg sourceTag "${TESSERACT_TAG}" \
  --arg sourceTagObject "${TESSERACT_TAG_OBJECT}" \
  --arg sourceCommit "${TESSERACT_COMMIT}" \
  --arg sourceUrl "${TESSERACT_SOURCE_URL}" \
  --arg sourceSha256 "${TESSERACT_SOURCE_SHA256}" \
  --arg tessdataTag "${TESSDATA_TAG}" \
  --arg tessdataTagObject "${TESSDATA_TAG_OBJECT}" \
  --arg tessdataCommit "${TESSDATA_COMMIT}" \
  --arg sourceDateEpoch "${SOURCE_DATE_EPOCH_VALUE}" \
  --argjson buildPackages "${build_packages_json}" \
  --argjson runtimePackages "${runtime_packages_json}" \
  '{
    schemaVersion: 1,
    builder: {
      image: $builderImage,
      aptSnapshot: $aptSnapshot,
      osRelease: $osRelease,
      architecture: $architecture,
      compiler: $compiler,
      cmake: $cmake,
      ninja: $ninja,
      sourceDateEpoch: $sourceDateEpoch,
      packages: $buildPackages
    },
    tesseractSource: {
      tag: $sourceTag,
      tagObject: $sourceTagObject,
      commit: $sourceCommit,
      tagSignatureVerified: true,
      archiveUrl: $sourceUrl,
      archiveSha256: $sourceSha256
    },
    tessdataSource: {
      tag: $tessdataTag,
      tagObject: $tessdataTagObject,
      commit: $tessdataCommit,
      tagSignatureVerified: true
    },
    runtimePackages: $runtimePackages
  }' > "${OUTPUT_ROOT}/BUILD-EVIDENCE.json"

find "${OUTPUT_ROOT}" -type f -exec touch --date="@${SOURCE_DATE_EPOCH_VALUE}" {} +
find "${OUTPUT_ROOT}" -type d -exec touch --date="@${SOURCE_DATE_EPOCH_VALUE}" {} +

LD_LIBRARY_PATH="${OUTPUT_ROOT}/lib" "${OUTPUT_ROOT}/bin/tesseract" --version | head -n1 | grep -Fx 'tesseract 5.5.3'
LD_LIBRARY_PATH="${OUTPUT_ROOT}/lib" "${OUTPUT_ROOT}/bin/tesseract" \
  --tessdata-dir "${OUTPUT_ROOT}/tessdata" --list-langs \
  | grep -E '^(eng|chi_sim|chi_tra)$'

# The container needs root only for its isolated snapshot toolchain. Return the
# bounded mounted output to the invoking runner so a same-path clean rebuild
# can remove it without broad permissions or host-level sudo.
chown -R "${ARTIFACT_OUTPUT_UID}:${ARTIFACT_OUTPUT_GID}" "${OUTPUT_ROOT}"
rm -rf "${WORK_ROOT}"
echo "release-local Tesseract runtime built at ${1}"
