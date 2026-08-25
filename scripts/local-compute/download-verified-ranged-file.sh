#!/usr/bin/env bash
set -euo pipefail

if (( $# != 5 )); then
  echo "usage: download-verified-ranged-file.sh URL DESTINATION SIZE SHA256 PARTS" >&2
  exit 2
fi

readonly URL="$1"
readonly DESTINATION="$2"
readonly EXPECTED_SIZE="$3"
readonly EXPECTED_SHA256="$4"
readonly PART_COUNT="$5"
readonly CONCURRENCY=4

[[ "$URL" == https://* ]]
[[ "$DESTINATION" == /* && "$DESTINATION" != "/" ]]
[[ "$EXPECTED_SIZE" =~ ^[1-9][0-9]*$ ]]
[[ "$EXPECTED_SHA256" =~ ^[0-9a-f]{64}$ ]]
[[ "$PART_COUNT" =~ ^[1-9][0-9]*$ ]]
(( PART_COUNT <= 32 ))

if [[ -f "$DESTINATION" ]]; then
  if [[ "$(stat -c %s "$DESTINATION")" = "$EXPECTED_SIZE" ]] \
    && echo "$EXPECTED_SHA256  $DESTINATION" | sha256sum --check --status; then
    printf 'VERIFIED_RANGED_DOWNLOAD=PASS\n'
    printf 'REUSED=true\n'
    printf 'FILE=%s\n' "$DESTINATION"
    printf 'SIZE=%s\n' "$EXPECTED_SIZE"
    printf 'SHA256=%s\n' "$EXPECTED_SHA256"
    exit 0
  fi
  echo "existing destination does not match the required identity" >&2
  exit 3
fi
if [[ -e "$DESTINATION" ]]; then
  echo "destination exists and is not a regular file" >&2
  exit 3
fi

readonly PART_ROOT="${DESTINATION}.parts"
readonly STAGING="${DESTINATION}.staging"
install -d -m 0750 "$(dirname "$DESTINATION")" "$PART_ROOT"

download_part() {
  local index="$1"
  local start=$(( EXPECTED_SIZE * index / PART_COUNT ))
  local end=$(( EXPECTED_SIZE * (index + 1) / PART_COUNT - 1 ))
  local expected=$(( end - start + 1 ))
  local part
  part="$(printf '%s/part-%03d' "$PART_ROOT" "$index")"
  if [[ -f "$part" && "$(stat -c %s "$part")" == "$expected" ]]; then
    return 0
  fi
  rm -f -- "${part}.tmp"
  local status
  status="$(curl \
    --fail \
    --location \
    --proto '=https' \
    --proto-redir '=https' \
    --range "${start}-${end}" \
    --max-filesize "$expected" \
    --retry 10 \
    --retry-all-errors \
    --retry-delay 2 \
    --connect-timeout 30 \
    --speed-time 120 \
    --speed-limit 1024 \
    --silent \
    --show-error \
    --write-out '%{http_code}' \
    --output "${part}.tmp" \
    "$URL")"
  if [[ "$status" != "206" || "$(stat -c %s "${part}.tmp")" != "$expected" ]]; then
    rm -f -- "${part}.tmp"
    echo "range $start-$end was not returned exactly" >&2
    return 1
  fi
  mv -- "${part}.tmp" "$part"
}

pids=()
for (( index = 0; index < PART_COUNT; index++ )); do
  download_part "$index" &
  pids+=("$!")
  if (( ${#pids[@]} == CONCURRENCY || index == PART_COUNT - 1 )); then
    for pid in "${pids[@]}"; do
      wait "$pid"
    done
    pids=()
  fi
done

rm -f -- "$STAGING"
for (( index = 0; index < PART_COUNT; index++ )); do
  cat "$(printf '%s/part-%03d' "$PART_ROOT" "$index")" >> "$STAGING"
done
test "$(stat -c %s "$STAGING")" = "$EXPECTED_SIZE"
echo "$EXPECTED_SHA256  $STAGING" | sha256sum --check --status
chmod 0640 "$STAGING"
mv -- "$STAGING" "$DESTINATION"
rm -rf -- "$PART_ROOT"

printf 'VERIFIED_RANGED_DOWNLOAD=PASS\n'
printf 'REUSED=false\n'
printf 'FILE=%s\n' "$DESTINATION"
printf 'SIZE=%s\n' "$EXPECTED_SIZE"
printf 'SHA256=%s\n' "$EXPECTED_SHA256"
