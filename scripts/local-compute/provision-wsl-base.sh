#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
  echo "provision-wsl-base.sh must run as root" >&2
  exit 2
fi

if (( $# != 1 )); then
  echo "usage: provision-wsl-base.sh WSL_CONF" >&2
  exit 2
fi

readonly WSL_CONF="$1"
readonly WORKER_USER="academiccloud"
readonly WORKER_GROUP="academiccloud"

test -f "$WSL_CONF"
test "$(. /etc/os-release && printf '%s' "$ID")" = "ubuntu"
test "$(. /etc/os-release && printf '%s' "$VERSION_ID")" = "24.04"
test "$(uname -m)" = "x86_64"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  build-essential \
  ca-certificates \
  cmake \
  curl \
  fonts-noto-cjk \
  git \
  jq \
  libgl1 \
  libglib2.0-0 \
  libgomp1 \
  ninja-build \
  pciutils \
  pkg-config \
  python3 \
  python3-pip \
  python3-venv \
  time \
  xz-utils

if ! getent group "$WORKER_GROUP" >/dev/null; then
  groupadd --gid 1000 "$WORKER_GROUP"
fi
if ! id "$WORKER_USER" >/dev/null 2>&1; then
  useradd --uid 1000 --gid "$WORKER_GROUP" --create-home --shell /bin/bash "$WORKER_USER"
fi

install -d -o root -g root -m 0755 /opt/academiccloud-compute
install -d -o "$WORKER_USER" -g "$WORKER_GROUP" -m 0750 \
  /srv/academiccloud-compute \
  /srv/academiccloud-compute/cache \
  /srv/academiccloud-compute/models \
  /srv/academiccloud-compute/releases \
  /var/lib/academiccloud-compute \
  /var/lib/academiccloud-compute/tmp \
  /var/log/academiccloud-compute
install -o root -g root -m 0644 "$WSL_CONF" /etc/wsl.conf

find /var/lib/academiccloud-compute/tmp -mindepth 1 -maxdepth 1 -xdev -delete

echo "WSL_BASE_PROVISION=PASS"
