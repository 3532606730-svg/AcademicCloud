#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
  echo "install-node-runtime.sh must run as root" >&2
  exit 2
fi

readonly NODE_VERSION="24.16.0"
readonly NODE_ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz"
readonly NODE_SHA256="d804845d34eddc21dc1092b519d643ef40b1f58ec5dec5c22b1f4bd8fabde6c9"
readonly NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}"
readonly CACHE_ROOT="/srv/academiccloud-compute/cache/node"
readonly INSTALL_ROOT="/opt/academiccloud-compute/node"
readonly TARGET="${INSTALL_ROOT}/${NODE_VERSION}"
readonly STAGE="${INSTALL_ROOT}/.${NODE_VERSION}.staging.$$"

install -d -o academiccloud -g academiccloud -m 0750 "$CACHE_ROOT"
install -d -o root -g root -m 0755 "$INSTALL_ROOT"

if [[ ! -f "${CACHE_ROOT}/${NODE_ARCHIVE}" ]]; then
  curl --fail --location --proto '=https' --tlsv1.2 \
    --retry 4 --retry-all-errors \
    --output "${CACHE_ROOT}/${NODE_ARCHIVE}.partial" \
    "$NODE_URL"
  mv -f "${CACHE_ROOT}/${NODE_ARCHIVE}.partial" "${CACHE_ROOT}/${NODE_ARCHIVE}"
fi

printf '%s  %s\n' "$NODE_SHA256" "${CACHE_ROOT}/${NODE_ARCHIVE}" | sha256sum --check --strict

rm -rf -- "$STAGE"
install -d -o root -g root -m 0755 "$STAGE"
tar --extract --xz --file "${CACHE_ROOT}/${NODE_ARCHIVE}" \
  --directory "$STAGE" --strip-components=1

test "$("${STAGE}/bin/node" --version)" = "v${NODE_VERSION}"
readonly NPM_VERSION="$(PATH="${STAGE}/bin:${PATH}" "${STAGE}/bin/npm" --version)"
test "$NPM_VERSION" != ""

jq --null-input \
  --arg nodeVersion "$NODE_VERSION" \
  --arg archive "$NODE_ARCHIVE" \
  --arg archiveSha256 "$NODE_SHA256" \
  --arg sourceUrl "$NODE_URL" \
  --arg npmVersion "$NPM_VERSION" \
  '{nodeVersion: $nodeVersion, npmVersion: $npmVersion, platform: "linux-x64", archive: $archive, archiveSha256: $archiveSha256, sourceUrl: $sourceUrl}' \
  >"${STAGE}/runtime-node.json"
chmod 0644 "${STAGE}/runtime-node.json"

if [[ -e "$TARGET" ]]; then
  test -f "${TARGET}/runtime-node.json"
  test "$(jq -r '.archiveSha256' "${TARGET}/runtime-node.json")" = "$NODE_SHA256"
  rm -rf -- "$STAGE"
else
  mv -- "$STAGE" "$TARGET"
fi

ln -sfn "$TARGET" "${INSTALL_ROOT}/.current.$$"
mv -Tf "${INSTALL_ROOT}/.current.$$" "${INSTALL_ROOT}/current"

echo "LOCAL_NODE_IDENTITY=PASS"
echo "NODE_VERSION=$("${INSTALL_ROOT}/current/bin/node" --version)"
echo "NODE_ARCHIVE_SHA256=${NODE_SHA256}"
