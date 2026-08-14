#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

readonly SOURCE_COMMIT="639baa9596a17f4160521f31440d9e3ac3b12eda"
readonly ARTIFACT_BASE="academiccloud-linux-x64-node24-${SOURCE_COMMIT}"
readonly ZIP_SHA256="6472f6cd5cd33f4a6af7a836b6617cfd47dd9a3115e8d342ba75f28becaf98fe"
readonly ARCHIVE_SHA256="0985f32c9ed063d3d9e37a97f3f7c80fab4235dbf13e59fe2b67dafb318254f9"
readonly MANIFEST_SHA256="f3d3c49308e9642978c988783347864337a859447293d32caad286fe72c9e873"
readonly RUNTIME_EVIDENCE_SHA256="9b8dff5e65c37326030723ef915345940c28ce5bb2a2f86c8afa72b63e5f68dc"
readonly CHECKSUM_FILE_SHA256="6bb09d58a77a94ba0750c634d6ef3fff08ac4a9498a2c28ce95395f13c939e24"
readonly EXPECTED_NGINX_HASH="cb5d4fbec0712ab7911dbd4973ca42b3305852d91da33d739e530099dd13670c"
readonly APP_HOST="cloud.ajtlab.top"
readonly BUCKET_HOST="ajt-academiccloud-kl-8f3c.oss-ap-southeast-3.aliyuncs.com"
readonly RELEASE_ROOT="/opt/academiccloud/releases"
readonly RELEASE_PATH="${RELEASE_ROOT}/${SOURCE_COMMIT}"
readonly CURRENT_PATH="/opt/academiccloud/current"
readonly CURRENT_TEMP="/opt/academiccloud/.current-prod03a-${SOURCE_COMMIT}"
readonly PREPARED_PATH="/etc/academiccloud/prepared"

fail() {
  printf 'foundation error: %s\n' "$*" >&2
  exit 1
}

require_absent() {
  local path="$1"
  if [[ -e "$path" || -L "$path" ]]; then
    fail "expected absent path: ${path}"
  fi
}

require_root_owned_regular() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || fail "expected regular non-symlink file: ${path}"
  [[ "$(stat -c '%u:%g' -- "$path")" == "0:0" ]] || fail "expected root ownership: ${path}"
}

if [[ "$#" -ne 1 ]]; then
  fail "usage: $0 /var/tmp/academiccloud-prod03a-XXXXXXXX"
fi

readonly STAGE="$1"
readonly STAGE_REAL="$(readlink -f -- "$STAGE")"
[[ "$STAGE" == "$STAGE_REAL" ]] || fail "stage must be a resolved absolute path"
[[ "$STAGE_REAL" =~ ^/var/tmp/academiccloud-prod03a-[A-Za-z0-9]{8}$ ]] || fail "stage path is outside the task namespace"
[[ -d "$STAGE_REAL" && ! -L "$STAGE_REAL" ]] || fail "stage must be a real directory"
[[ "$(stat -c '%u:%g' -- "$STAGE_REAL")" == "0:0" ]] || fail "stage must be root-owned"
[[ "$(stat -c '%a' -- "$STAGE_REAL")" == "700" ]] || fail "stage must have mode 0700"

readonly ARTIFACT_ZIP="${STAGE_REAL}/artifact.zip"
readonly BUNDLE_PATH="${STAGE_REAL}/bundle"
readonly EXTRACTED_RELEASE="${STAGE_REAL}/release"
readonly BEFORE_EVIDENCE="${STAGE_REAL}/foundation-before.txt"
readonly AFTER_EVIDENCE="${STAGE_REAL}/foundation-after.txt"
readonly ROLLBACK_EVIDENCE="${STAGE_REAL}/foundation-rollback.txt"
readonly ROLLBACK_PLAN="${STAGE_REAL}/foundation-rollback-plan.txt"

require_root_owned_regular "$ARTIFACT_ZIP"
require_root_owned_regular "${STAGE_REAL}/alibaba-production-foundation.sh"
require_root_owned_regular "${STAGE_REAL}/alibaba-production-activate.sh"
require_root_owned_regular "${STAGE_REAL}/production-owner-bootstrap.ps1"
require_absent "$BUNDLE_PATH"
require_absent "$EXTRACTED_RELEASE"

[[ "$(id -u)" -eq 0 ]] || fail "must run as root"
[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]] || fail "requires Linux x86_64"
source /etc/os-release
[[ "$ID" == "ubuntu" && "$VERSION_ID" == "24.04" ]] || fail "requires Ubuntu 24.04"
[[ "$(node --version)" == "v24.19.0" ]] || fail "requires Node.js v24.19.0"
[[ "$(systemctl is-system-running)" == "running" ]] || fail "systemd is not running"
[[ -z "$(systemctl --failed --no-legend)" ]] || fail "host has failed units"
[[ "$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)" -ge 900000 ]] || fail "1 GiB-class memory baseline is absent"
[[ "$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)" -gt 0 ]] || fail "swap has no free capacity"
if journalctl -k -b --no-pager | grep -Eiq 'out of memory|oom-kill|killed process'; then
  fail "current boot contains OOM evidence"
fi

[[ "$(systemctl is-active nginx.service)" == "active" ]] || fail "nginx is not active"
[[ "$(systemctl is-active ssh.socket)" == "active" ]] || fail "ssh socket is not active"
nginx -t
readonly ACTIVE_NGINX_HASH="$(find /etc/nginx -xdev -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')"
[[ "$ACTIVE_NGINX_HASH" == "$EXPECTED_NGINX_HASH" ]] || fail "existing Nginx tree differs from reviewed baseline"
[[ "$(find /etc/nginx/sites-enabled -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == "default" ]] || fail "unexpected enabled Nginx site"
[[ -L /etc/nginx/sites-enabled/default ]] || fail "default Nginx site is not a symlink"
[[ "$(readlink -f /etc/nginx/sites-enabled/default)" == "/etc/nginx/sites-available/default" ]] || fail "default Nginx target changed"

getent passwd academiccloud >/dev/null && fail "academiccloud user already exists"
getent group academiccloud >/dev/null && fail "academiccloud group already exists"
for path in \
  /opt/academiccloud \
  /etc/academiccloud \
  /var/lib/academiccloud \
  /var/log/academiccloud \
  /etc/systemd/system/academiccloud.service \
  /etc/nginx/sites-available/academiccloud \
  /etc/nginx/sites-enabled/academiccloud \
  /etc/nginx/snippets/academiccloud-security-headers.conf \
  /etc/logrotate.d/academiccloud-nginx; do
  require_absent "$path"
done
[[ "$(systemctl show -p LoadState --value academiccloud.service)" == "not-found" ]] || fail "academiccloud unit already exists"
if ss -lntH 'sport = :3000' | grep -q .; then fail "port 3000 already has a listener"; fi
if pgrep -f '/opt/academiccloud/.*/backend/dist/main.js' >/dev/null; then fail "AcademicCloud process already exists"; fi

foundation_succeeded=0
created_group=0
created_user=0
created_opt=0
created_etc=0
created_state=0
created_log=0
published_release=0
published_current=0
installed_unit=0

rollback_foundation() {
  local exit_code=$?
  if [[ "$foundation_succeeded" -eq 1 ]]; then
    return
  fi
  trap - EXIT
  set +e
  {
    printf 'rollbackAt=%s\n' "$(date --iso-8601=seconds)"
    printf 'originalExitCode=%s\n' "$exit_code"
    if [[ "$installed_unit" -eq 1 ]]; then
      systemctl stop academiccloud.service >/dev/null 2>&1
      systemctl disable academiccloud.service >/dev/null 2>&1
      rm -f -- /etc/systemd/system/academiccloud.service
      systemctl daemon-reload
      printf '%s\n' 'removedUnit=yes'
    fi
    if [[ "$published_current" -eq 1 && -L "$CURRENT_PATH" && "$(readlink -f -- "$CURRENT_PATH")" == "$RELEASE_PATH" ]]; then
      rm -f -- "$CURRENT_PATH"
      printf '%s\n' 'removedCurrent=yes'
    fi
    if [[ -L "$CURRENT_TEMP" && "$(readlink -f -- "$CURRENT_TEMP")" == "$RELEASE_PATH" ]]; then
      rm -f -- "$CURRENT_TEMP"
      printf '%s\n' 'removedCurrentTemp=yes'
    fi
    if [[ "$published_release" -eq 1 && -d "$RELEASE_PATH" && ! -L "$RELEASE_PATH" ]]; then
      rm -rf -- "$RELEASE_PATH"
      printf '%s\n' 'removedRelease=yes'
    fi
    rm -rf -- "$BUNDLE_PATH" "$EXTRACTED_RELEASE"
    if [[ "$created_log" -eq 1 ]]; then rmdir -- /var/log/academiccloud; fi
    if [[ "$created_state" -eq 1 ]]; then rmdir -- /var/lib/academiccloud; fi
    if [[ "$created_etc" -eq 1 ]]; then rm -rf -- /etc/academiccloud; fi
    if [[ "$created_opt" -eq 1 ]]; then rmdir -- "$RELEASE_ROOT" /opt/academiccloud; fi
    if [[ "$created_user" -eq 1 ]]; then userdel academiccloud; fi
    if [[ "$created_group" -eq 1 ]] && getent group academiccloud >/dev/null; then groupdel academiccloud; fi
    printf '%s\n' 'automaticPackagePurge=no' 'stagePreserved=yes'
  } >"$ROLLBACK_EVIDENCE" 2>&1
  chmod 0600 "$ROLLBACK_EVIDENCE" 2>/dev/null
  exit "$exit_code"
}
trap rollback_foundation EXIT

{
  printf 'capturedAt=%s\n' "$(date --iso-8601=seconds)"
  printf 'bootId=%s\n' "$(cat /proc/sys/kernel/random/boot_id)"
  printf 'systemState=%s\n' "$(systemctl is-system-running)"
  printf 'failedUnits=%s\n' "$(systemctl --failed --no-legend | wc -l)"
  awk '/^(MemTotal|MemAvailable|SwapTotal|SwapFree):/ {print}' /proc/meminfo
  printf 'nginxTreeSha256=%s\n' "$ACTIVE_NGINX_HASH"
  printf 'defaultSite=%s\n' "$(readlink -f /etc/nginx/sites-enabled/default)"
  printf '%s\n' 'targetPaths=absent'
  ss -lntup
} >"$BEFORE_EVIDENCE"
chmod 0600 "$BEFORE_EVIDENCE"

export STAGE_REAL ARTIFACT_ZIP BUNDLE_PATH EXTRACTED_RELEASE SOURCE_COMMIT ARTIFACT_BASE
export ZIP_SHA256 ARCHIVE_SHA256 MANIFEST_SHA256 RUNTIME_EVIDENCE_SHA256 CHECKSUM_FILE_SHA256
python3 - <<'PY'
import hashlib
import json
import os
import pathlib
import shutil
import stat
import tarfile
import zipfile

stage = pathlib.Path(os.environ["STAGE_REAL"])
zip_path = pathlib.Path(os.environ["ARTIFACT_ZIP"])
bundle = pathlib.Path(os.environ["BUNDLE_PATH"])
release = pathlib.Path(os.environ["EXTRACTED_RELEASE"])
base = os.environ["ARTIFACT_BASE"]

def fail(message):
    raise SystemExit(f"foundation artifact error: {message}")

def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

if sha256(zip_path) != os.environ["ZIP_SHA256"]:
    fail("artifact ZIP SHA-256 mismatch")

expected_names = {
    f"{base}.tar.gz",
    f"{base}.tar.gz.sha256",
    f"{base}.manifest.json",
    f"{base}.runtime-verification.json",
}
with zipfile.ZipFile(zip_path) as archive_zip:
    infos = archive_zip.infolist()
    if len(infos) != 4 or {item.filename for item in infos} != expected_names:
        fail("artifact ZIP does not contain the exact four expected bundle files")
    for item in infos:
        name = pathlib.PurePosixPath(item.filename)
        if item.is_dir() or name.is_absolute() or len(name.parts) != 1 or ".." in name.parts:
            fail(f"unsafe ZIP entry: {item.filename}")
        if item.flag_bits & 0x1:
            fail(f"encrypted ZIP entry: {item.filename}")
    bundle.mkdir(mode=0o700)
    for item in infos:
        destination = bundle / item.filename
        with archive_zip.open(item) as source, destination.open("xb") as target:
            shutil.copyfileobj(source, target)
        destination.chmod(0o600)

archive_path = bundle / f"{base}.tar.gz"
checksum_path = bundle / f"{base}.tar.gz.sha256"
manifest_path = bundle / f"{base}.manifest.json"
runtime_path = bundle / f"{base}.runtime-verification.json"
if sha256(archive_path) != os.environ["ARCHIVE_SHA256"]:
    fail("release archive SHA-256 mismatch")
if sha256(manifest_path) != os.environ["MANIFEST_SHA256"]:
    fail("manifest SHA-256 mismatch")
if sha256(runtime_path) != os.environ["RUNTIME_EVIDENCE_SHA256"]:
    fail("runtime evidence SHA-256 mismatch")
if sha256(checksum_path) != os.environ["CHECKSUM_FILE_SHA256"]:
    fail("checksum file SHA-256 mismatch")
expected_checksum = f'{os.environ["ARCHIVE_SHA256"]}  {archive_path.name}'
if checksum_path.read_text(encoding="utf-8").strip() != expected_checksum:
    fail("checksum file content mismatch")

manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
runtime = json.loads(runtime_path.read_text(encoding="utf-8"))
if manifest.get("schemaVersion") != 1:
    fail("unsupported manifest schema")
if (manifest.get("sourceCommit"), manifest.get("platform"), manifest.get("architecture"), manifest.get("nodeVersion")) != (
    os.environ["SOURCE_COMMIT"], "linux", "x64", "v24.19.0"
):
    fail("manifest identity mismatch")
files = manifest.get("files")
if not isinstance(files, list) or len(files) != 4619:
    fail("manifest file count mismatch")
if runtime.get("status") != "ok" or runtime.get("sourceCommit") != os.environ["SOURCE_COMMIT"]:
    fail("runtime evidence identity or status mismatch")
if runtime.get("archiveSha256") != os.environ["ARCHIVE_SHA256"] or runtime.get("manifestSha256") != os.environ["MANIFEST_SHA256"]:
    fail("runtime evidence digest mismatch")
if runtime.get("manifestFileCount") != 4619 or runtime.get("manifestTotalBytes") != 32741391:
    fail("runtime evidence file totals mismatch")
if runtime.get("betterSqlite3", {}).get("status") != "ok" or runtime.get("betterSqlite3", {}).get("sqliteVersion") != "3.53.4":
    fail("SQLite runtime evidence mismatch")
if runtime.get("argon2id") != {"status": "ok", "parameters": "m=65536,t=3,p=1", "verified": True}:
    fail("Argon2id runtime evidence mismatch")
expected_native = [
    "node_modules/argon2/prebuilds/linux-x64/argon2.glibc.node",
    "node_modules/better-sqlite3/prebuilds/linux-x64.node",
]
native = runtime.get("nativeModules", {})
if native.get("status") != "ok" or native.get("format") != "ELF64 x86-64" or native.get("paths") != expected_native:
    fail("native-module runtime evidence mismatch")
compiled = runtime.get("compiledAcceptance", {})
if compiled.get("status") != "ok" or compiled.get("compiledBuild") is not True or compiled.get("health") != "ok" or compiled.get("readiness") != "ready":
    fail("compiled acceptance evidence mismatch")
if not all(compiled.get(key) is True for key in (
    "sessionSurvivedRestart", "maintenanceDryRun", "backupVerified", "isolatedRestoreVerified", "restoredSessionValid"
)):
    fail("compiled acceptance durability evidence mismatch")
if compiled.get("redeployMigrationCount") != 0:
    fail("compiled acceptance redeploy evidence mismatch")

release.mkdir(mode=0o700)
with tarfile.open(archive_path, mode="r:gz") as archive_tar:
    seen = set()
    for member in archive_tar.getmembers():
        raw = member.name
        normalized = raw[2:] if raw.startswith("./") else raw
        if normalized in ("", "."):
            if member.isdir():
                continue
            fail(f"unsafe archive root entry: {raw}")
        path = pathlib.PurePosixPath(normalized)
        if path.is_absolute() or ".." in path.parts or "\\" in normalized or normalized in seen:
            fail(f"unsafe or duplicate archive path: {raw}")
        if not (member.isdir() or member.isfile() or member.issym()):
            fail(f"unsupported archive entry type: {raw}")
        if member.issym():
            target = pathlib.PurePosixPath(member.linkname)
            if target.is_absolute() or "\\" in member.linkname:
                fail(f"unsafe symlink target: {raw}")
            resolved = pathlib.PurePosixPath(path.parent, target)
            parts = []
            for part in resolved.parts:
                if part == "..":
                    if not parts:
                        fail(f"escaping symlink target: {raw}")
                    parts.pop()
                elif part not in ("", "."):
                    parts.append(part)
            if not parts:
                fail(f"empty symlink target: {raw}")
        seen.add(normalized)
    archive_tar.extractall(release, filter="data")

internal_manifest = release / "ARTIFACT-MANIFEST.json"
if internal_manifest.read_bytes() != manifest_path.read_bytes():
    fail("embedded and external manifests differ")

expected = {entry["path"]: entry for entry in files}
actual = {}
for root, directories, filenames in os.walk(release, followlinks=False):
    root_path = pathlib.Path(root)
    for name in list(directories) + filenames:
        path = root_path / name
        if path.is_symlink() or path.is_file():
            relative = path.relative_to(release).as_posix()
            if relative != "ARTIFACT-MANIFEST.json":
                actual[relative] = path
if set(actual) != set(expected):
    fail("extracted release paths differ from manifest")
for relative, entry in expected.items():
    path = actual[relative]
    if entry.get("type") == "file":
        if path.is_symlink() or not path.is_file():
            fail(f"manifest type mismatch: {relative}")
        if path.stat().st_size != entry.get("size") or sha256(path) != entry.get("sha256"):
            fail(f"manifest file mismatch: {relative}")
        if stat.S_IMODE(path.stat().st_mode) != entry.get("mode"):
            fail(f"manifest mode mismatch: {relative}")
    elif entry.get("type") == "symlink":
        if not path.is_symlink() or os.readlink(path) != entry.get("target"):
            fail(f"manifest symlink mismatch: {relative}")
        if hashlib.sha256(os.readlink(path).encode("utf-8")).hexdigest() != entry.get("sha256"):
            fail(f"manifest symlink digest mismatch: {relative}")
        resolved = path.resolve(strict=True)
        if release.resolve() not in (resolved, *resolved.parents):
            fail(f"symlink escapes release: {relative}")
    else:
        fail(f"unknown manifest entry type: {relative}")

verification = {
    "status": "ok",
    "sourceCommit": os.environ["SOURCE_COMMIT"],
    "zipSha256": os.environ["ZIP_SHA256"],
    "archiveSha256": os.environ["ARCHIVE_SHA256"],
    "manifestSha256": os.environ["MANIFEST_SHA256"],
    "runtimeEvidenceSha256": os.environ["RUNTIME_EVIDENCE_SHA256"],
    "manifestFileCount": len(files),
    "manifestTotalBytes": sum(entry.get("size", 0) for entry in files),
    "runtimeStatus": runtime["status"],
    "compiledAcceptanceStatus": compiled["status"],
}
evidence_path = stage / "foundation-artifact-verification.json"
evidence_path.write_text(json.dumps(verification, indent=2) + "\n", encoding="utf-8")
evidence_path.chmod(0o600)
PY

groupadd --system academiccloud
created_group=1
useradd --system --gid academiccloud --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin academiccloud
created_user=1
[[ "$(getent passwd academiccloud | cut -d: -f6-7)" == "/nonexistent:/usr/sbin/nologin" ]] || fail "service account properties differ"

install -d -o root -g root -m 0755 /opt/academiccloud
created_opt=1
install -d -o root -g root -m 0755 "$RELEASE_ROOT"
install -d -o root -g root -m 0700 /etc/academiccloud
created_etc=1
install -d -o root -g root -m 0700 "$PREPARED_PATH"
install -d -o academiccloud -g academiccloud -m 0700 /var/lib/academiccloud
created_state=1
install -d -o root -g adm -m 0750 /var/log/academiccloud
created_log=1

chown -R root:root "$EXTRACTED_RELEASE"
find "$EXTRACTED_RELEASE" -xdev -type d -exec chmod 0755 {} +
[[ "$(stat -c '%d' -- "$STAGE_REAL")" == "$(stat -c '%d' -- "$RELEASE_ROOT")" ]] || fail "stage and release root are not on the same filesystem"
mv -T -- "$EXTRACTED_RELEASE" "$RELEASE_PATH"
published_release=1
require_absent "$CURRENT_TEMP"
ln -s -- "$RELEASE_PATH" "$CURRENT_TEMP"
mv -T -- "$CURRENT_TEMP" "$CURRENT_PATH"
published_current=1
[[ "$(readlink -f -- "$CURRENT_PATH")" == "$RELEASE_PATH" ]] || fail "current release link mismatch"

export RELEASE_PATH
python3 - <<'PY'
import hashlib
import json
import os
import pathlib
import stat

release = pathlib.Path(os.environ["RELEASE_PATH"])
manifest = json.loads((release / "ARTIFACT-MANIFEST.json").read_text(encoding="utf-8"))
for entry in manifest["files"]:
    path = release.joinpath(*entry["path"].split("/"))
    if entry["type"] == "file":
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if path.is_symlink() or digest != entry["sha256"] or path.stat().st_size != entry["size"]:
            raise SystemExit(f"published release file mismatch: {entry['path']}")
        if stat.S_IMODE(path.stat().st_mode) != entry["mode"]:
            raise SystemExit(f"published release mode mismatch: {entry['path']}")
    elif entry["type"] == "symlink":
        if not path.is_symlink() or os.readlink(path) != entry["target"]:
            raise SystemExit(f"published release symlink mismatch: {entry['path']}")
    else:
        raise SystemExit(f"published release type mismatch: {entry['path']}")
PY
[[ -z "$(cd / && runuser -u academiccloud -- find "$RELEASE_PATH" -xdev -writable -print -quit)" ]] || fail "service identity can write the release"
(cd / && runuser -u academiccloud -- test -r "$RELEASE_PATH/backend/dist/main.js") || fail "service identity cannot read the runtime"
(cd / && runuser -u academiccloud -- test -x "$RELEASE_PATH/backend") || fail "service identity cannot traverse the runtime"

install -o root -g root -m 0644 "$RELEASE_PATH/deployment/systemd/academiccloud.service" /etc/systemd/system/academiccloud.service
installed_unit=1
cmp --silent -- "$RELEASE_PATH/deployment/systemd/academiccloud.service" /etc/systemd/system/academiccloud.service || fail "installed unit differs from release"
systemctl daemon-reload
systemctl disable academiccloud.service >/dev/null 2>&1 || true
[[ "$(systemctl is-enabled academiccloud.service 2>/dev/null || true)" == "disabled" ]] || fail "unit is not disabled"
[[ "$(systemctl is-active academiccloud.service 2>/dev/null || true)" == "inactive" ]] || fail "unit is not inactive"
[[ -z "$(systemctl show -p MainPID --value academiccloud.service | sed '/^0$/d')" ]] || fail "unit has a running process"
systemd-analyze verify /etc/systemd/system/academiccloud.service >"${STAGE_REAL}/systemd-verify.txt" 2>&1
systemd-analyze security academiccloud.service --no-pager >"${STAGE_REAL}/systemd-security.txt" 2>&1
chmod 0600 "${STAGE_REAL}/systemd-verify.txt" "${STAGE_REAL}/systemd-security.txt"

export APP_HOST BUCKET_HOST RELEASE_PATH PREPARED_PATH
python3 - <<'PY'
import os
import pathlib

release = pathlib.Path(os.environ["RELEASE_PATH"])
prepared = pathlib.Path(os.environ["PREPARED_PATH"])
app_host = os.environ["APP_HOST"]
bucket_host = os.environ["BUCKET_HOST"]

site = (release / "deployment/nginx/academiccloud.conf").read_text(encoding="utf-8")
headers = (release / "deployment/nginx/academiccloud-security-headers.conf").read_text(encoding="utf-8")
logrotate = (release / "deployment/logrotate/academiccloud-nginx").read_text(encoding="utf-8")
site = site.replace("cloud.example.edu", app_host).replace("academiccloud-private.oss-ap-southeast-3.aliyuncs.com", bucket_host)
headers = headers.replace("academiccloud-private.oss-ap-southeast-3.aliyuncs.com", bucket_host)
for label, text in (("site", site), ("headers", headers)):
    if "cloud.example.edu" in text or "academiccloud-private" in text:
        raise SystemExit(f"foundation render error: placeholder remains in {label}")
    if app_host not in site or bucket_host not in (site + headers):
        raise SystemExit("foundation render error: required hostname missing")
outputs = {
    "academiccloud.nginx.conf.prepared": site,
    "academiccloud-security-headers.conf.prepared": headers,
    "academiccloud-logrotate.prepared": logrotate,
}
for name, text in outputs.items():
    path = prepared / name
    path.write_text(text, encoding="utf-8")
    path.chmod(0o600)
PY

install -o root -g root -m 0600 "${STAGE_REAL}/alibaba-production-activate.sh" "${PREPARED_PATH}/alibaba-production-activate.sh"
install -o root -g root -m 0600 "${STAGE_REAL}/production-owner-bootstrap.ps1" "${PREPARED_PATH}/production-owner-bootstrap.ps1.reference"

for active_path in \
  /etc/academiccloud/academiccloud.env \
  /var/lib/academiccloud/academiccloud.sqlite \
  /etc/nginx/sites-available/academiccloud \
  /etc/nginx/sites-enabled/academiccloud \
  /etc/nginx/snippets/academiccloud-security-headers.conf \
  /etc/logrotate.d/academiccloud-nginx; do
  require_absent "$active_path"
done
[[ "$(find /etc/nginx/sites-enabled -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)" == "default" ]] || fail "enabled Nginx sites changed"
nginx -t
readonly FINAL_NGINX_HASH="$(find /etc/nginx -xdev -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')"
[[ "$FINAL_NGINX_HASH" == "$EXPECTED_NGINX_HASH" ]] || fail "active Nginx tree changed"
if ss -lntH 'sport = :3000' | grep -q .; then fail "port 3000 became active"; fi
if pgrep -f '/opt/academiccloud/.*/backend/dist/main.js' >/dev/null; then fail "AcademicCloud process unexpectedly started"; fi

{
  printf 'capturedAt=%s\n' "$(date --iso-8601=seconds)"
  printf 'sourceCommit=%s\n' "$SOURCE_COMMIT"
  printf 'releasePath=%s\n' "$RELEASE_PATH"
  printf 'currentTarget=%s\n' "$(readlink -f -- "$CURRENT_PATH")"
  printf 'releaseManifestSha256=%s\n' "$(sha256sum "$RELEASE_PATH/ARTIFACT-MANIFEST.json" | awk '{print $1}')"
  printf 'unitSha256=%s\n' "$(sha256sum /etc/systemd/system/academiccloud.service | awk '{print $1}')"
  printf 'unitEnabled=%s\n' "$(systemctl is-enabled academiccloud.service 2>/dev/null || true)"
  printf 'unitActive=%s\n' "$(systemctl is-active academiccloud.service 2>/dev/null || true)"
  printf 'unitMainPID=%s\n' "$(systemctl show -p MainPID --value academiccloud.service)"
  printf 'nginxTreeSha256=%s\n' "$FINAL_NGINX_HASH"
  printf 'defaultSite=%s\n' "$(readlink -f /etc/nginx/sites-enabled/default)"
  printf '%s\n' 'env=absent' 'database=absent' 'account=absent' 'publicRoute=unchanged'
  find /opt/academiccloud /etc/academiccloud /var/lib/academiccloud /var/log/academiccloud /etc/systemd/system/academiccloud.service -xdev -printf '%y %m %u:%g %p -> %l\n' | sort
  ss -lntup
} >"$AFTER_EVIDENCE"
chmod 0600 "$AFTER_EVIDENCE"

{
  printf '%s\n' \
    'Use only before PROD-03B creates secrets, database state, certificate state, or an account.' \
    'Gate first: academiccloud.service disabled/inactive/MainPID=0; port 3000 absent; no process references the release.' \
    'Remove only exact task-owned files: /etc/systemd/system/academiccloud.service and /opt/academiccloud/current.' \
    "Remove only exact immutable release: ${RELEASE_PATH}." \
    'Remove /etc/academiccloud, /var/lib/academiccloud, and /var/log/academiccloud only while they contain no secret, database, log, or unknown state.' \
    'Remove academiccloud user/group only after confirming no owned process or file remains.' \
    'Run systemctl daemon-reload and reconfirm the prior Nginx hash, default route, listeners, services, memory, swap, and current-boot OOM evidence.' \
    'Do not automatically purge Certbot packages; package rollback is a separately reviewed apt action.'
} >"$ROLLBACK_PLAN"
chmod 0600 "$ROLLBACK_PLAN"

printf 'foundation-status=ok\nsourceCommit=%s\nreleasePath=%s\nunit=disabled,inactive\npublicRoute=unchanged\n' "$SOURCE_COMMIT" "$RELEASE_PATH"
foundation_succeeded=1
trap - EXIT
