import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), "utf8");
}

test("Nginx terminates HTTPS, serves the SPA, and overwrites trusted proxy headers", () => {
  const config = read("deployment/nginx/academiccloud.conf");
  const headers = read("deployment/nginx/academiccloud-security-headers.conf");
  const logrotate = read("deployment/logrotate/academiccloud-nginx");

  assert.match(config, /listen 80 default_server/);
  assert.ok(config.match(/^\s*server_tokens off;/gm)?.length === 3);
  assert.match(config, /return 301 https:\/\/cloud\.example\.edu\$request_uri/);
  assert.match(config, /listen 443 ssl http2/);
  assert.match(config, /ssl_protocols TLSv1\.2 TLSv1\.3/);
  assert.match(config, /location \/api\//);
  assert.match(config, /proxy_pass http:\/\/127\.0\.0\.1:3000/);
  assert.match(config, /proxy_set_header X-Forwarded-For \$remote_addr/);
  assert.doesNotMatch(config, /\$proxy_add_x_forwarded_for/);
  assert.match(config, /client_max_body_size 16k/);
  assert.match(config, /proxy_next_upstream off/);
  assert.match(config, /try_files \$uri \$uri\/ \/index\.html/);
  assert.match(config, /ssl_reject_handshake on/);
  assert.match(config, /location = \/api[\s\S]*\{"error":"not_found"\}/);
  assert.equal(config.match(/^\s*include \/etc\/nginx\/snippets\/academiccloud-security-headers\.conf;/gm)?.length, 4);
  assert.match(headers, /Cross-Origin-Resource-Policy "same-origin"/);
  assert.match(headers, /Content-Security-Policy/);
  assert.doesNotMatch(headers, /^\s*add_header Strict-Transport-Security/m);
  assert.match(config, /log_format academiccloud_safe/);
  assert.doesNotMatch(config.match(/log_format academiccloud_safe[^;]+/)?.[0] ?? "", /request_uri|request\b|args|referer|cookie|authorization/i);
  assert.equal(config.match(/^\s*access_log \/var\/log\/academiccloud\/nginx-access\.log academiccloud_safe;/gm)?.length, 4);
  assert.match(logrotate, /rotate 14/);
  assert.match(logrotate, /maxsize 10M/);
  assert.match(logrotate, /daily/);
  assert.match(logrotate, /compress/);
});

test("systemd keeps one loopback API process inside a restrictive writable boundary", () => {
  const unit = read("deployment/systemd/academiccloud.service");

  for (const directive of [
    "User=academiccloud",
    "EnvironmentFile=/etc/academiccloud/academiccloud.env",
    "UMask=0077",
    "StateDirectoryMode=0700",
    "NoNewPrivileges=true",
    "PrivateTmp=true",
    "PrivateDevices=true",
    "ProtectSystem=strict",
    "ProtectHome=true",
    "CapabilityBoundingSet=",
    "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK",
    "ReadWritePaths=/var/lib/academiccloud",
    "MemoryHigh=320M",
    "MemoryMax=384M",
    "Restart=on-failure",
    "RestartSec=5s",
    "StartLimitIntervalSec=300s",
    "StartLimitBurst=5",
  ]) {
    assert.ok(unit.includes(directive), `missing ${directive}`);
  }

  assert.doesNotMatch(unit, /MemoryDenyWriteExecute/);
  assert.doesNotMatch(unit, /ExecStart=.*tsx|npm run dev/);
});

test("future journald retention template is bounded and remains a repository artifact", () => {
  const journald = read("deployment/journald/90-academiccloud-retention.conf");
  assert.match(journald, /^\[Journal\]$/m);
  assert.match(journald, /^SystemMaxUse=512M$/m);
  assert.match(journald, /^SystemKeepFree=2G$/m);
  assert.match(journald, /^MaxRetentionSec=14day$/m);
  assert.match(journald, /^MaxFileSec=1day$/m);
  assert.match(journald, /^Compress=yes$/m);
  assert.match(journald, /separate Owner-approved production operations window/);
  assert.doesNotMatch(journald, /ForwardToRemote=yes|Storage=volatile/);
});

test("production environment example binds Fastify to loopback and contains no real secret", () => {
  const environment = read("deployment/env/academiccloud.env.example");

  assert.match(environment, /^NODE_ENV=production$/m);
  assert.match(environment, /^HOST=127\.0\.0\.1$/m);
  assert.match(environment, /^APP_ORIGIN=https:\/\//m);
  assert.match(environment, /^DATABASE_PATH=\/var\/lib\/academiccloud\//m);
  assert.match(environment, /^STORAGE_PROVIDER=aliyun-oss$/m);
  assert.match(environment, /^OSS_ACCESS_KEY_SECRET=replace-through-secret-installation$/m);
  assert.doesNotMatch(environment, /BEGIN PRIVATE KEY|ac_session=/);
});

test("Core production artifact excludes OCR/PDF-render runtime and retains only the shared Compute contract", () => {
  const artifact = read("scripts/production-artifact.mjs");
  const workflow = read(".github/workflows/production-build.yml");
  const backendPackage = read("backend/package.json");

  assert.match(artifact, /"compute-contracts\/dist\/index\.js"/u);
  assert.match(artifact, /schemaVersion: 3/u);
  assert.match(artifact, /coreOcrRuntime: false/u);
  assert.match(artifact, /corePdfRenderRuntime: false/u);
  assert.doesNotMatch(artifact, /verifyTesseractRuntime|verifyPdfJsRuntime|runtime\/tesseract/u);
  assert.doesNotMatch(backendPackage, /pdfjs-dist|@napi-rs\/canvas|tesseract/iu);
  assert.doesNotMatch(workflow, /build-tesseract-runtime|realistic-ocr-e2e|runtime\/tesseract/iu);
  assert.match(workflow, /--workspace @academiccloud\/backend --workspace @academiccloud\/compute-contracts/u);
  assert.match(workflow, /Core OCR\/PDF-render runtime/u);
});

test("Compute workflow owns the exact release-local OCR boundary and bounded worker controls", () => {
  const runtime = read("scripts/tesseract-runtime.mjs");
  const builder = read("scripts/build-tesseract-runtime.sh");
  const workflow = read(".github/workflows/derived-compute-worker.yml");

  assert.match(runtime, /version: "5\.5\.3"/u);
  assert.match(runtime, /sourceCommit: "db0ec62f81b0737fbbe184d8fea40af5738f8eef"/u);
  assert.match(runtime, /sourceArchiveSha256: "9218e62793116d42a9f6d14cd9348518b27f382096eea3d0f2d1a24616bb5884"/u);
  assert.match(runtime, /tessdataVersion: "4\.1\.0"/u);
  assert.match(runtime, /eng: "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"/u);
  assert.match(runtime, /chi_sim: "a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730"/u);
  assert.match(runtime, /chi_tra: "529c5b5797d64b126065cd55f2bb4c7fd7b15790798091b1ff259941a829330b"/u);
  assert.match(runtime, /verifyDynamicClosure/u);
  assert.match(runtime, /verifyLddResolution/u);
  assert.doesNotMatch(runtime, /\.map\(basename\)/u);
  assert.equal(runtime.includes("assert.doesNotMatch(ldd, /\\/work\\/"), false);
  assert.match(runtime, /synthetic OCR probe/u);
  assert.match(builder, /APT::Snapshot/u);
  assert.match(builder, /signed InRelease metadata still authenticates this first snapshot-only/u);
  assert.match(builder, /rm -f "\$\{SNAPSHOT_CA_BOOTSTRAP_CONFIG\}"/u);
  assert.match(builder, /require a normal certificate-verified snapshot refresh/u);
  assert.match(builder, /Authorization: Bearer \$\{GITHUB_API_TOKEN\}/u);
  assert.match(builder, /--retry 4 --retry-all-errors --retry-delay 2/u);
  assert.match(builder, /chown -R "\$\{ARTIFACT_OUTPUT_UID\}:\$\{ARTIFACT_OUTPUT_GID\}" "\$\{OUTPUT_ROOT\}"/u);
  assert.match(builder, /tagSignatureVerified/u);
  assert.match(builder, /patchelf --set-rpath '\$ORIGIN\/\.\.\/lib'/u);
  assert.match(workflow, /ubuntu@sha256:1e0a86e57d247923571b75e0aaf48a1449cf8c543d51fb3e07a4a7d7bfa79316/u);
  assert.equal(workflow.match(/--env "GITHUB_API_TOKEN=\$GITHUB_API_TOKEN"/gu)?.length, 1);
  assert.match(workflow, /timeout-minutes: 5/u);
  assert.match(workflow, /group: derived-compute-\$\{\{ inputs\.job_id \}\}/u);
  assert.match(workflow, /ACADEMICCLOUD_COMPUTE_BOOTSTRAP_SECRET/u);
  assert.match(workflow, /ACADEMICCLOUD_COMPUTE_CORE_ORIGIN/u);
  assert.match(workflow, /memory:probe/u);
  assert.match(workflow, /\/usr\/bin\/time -v/u);
  assert.match(workflow, /node --expose-gc compute\/dist\/main\.js/u);
  assert.match(workflow, /--core-base-url="\$COMPUTE_INPUT_CORE_ORIGIN"/u);
  assert.match(workflow, /--job-id="\$COMPUTE_INPUT_JOB_ID"/u);
  assert.match(workflow, /--attempt-id="\$COMPUTE_INPUT_ATTEMPT_ID"/u);
  assert.doesNotMatch(workflow, /--(?:core-base-url|job-id|attempt-id)=\$\{\{ inputs\./u);
  assert.match(workflow, /compute\/test\/realistic-ocr-e2e\.test\.ts/u);
  assert.doesNotMatch(workflow, /apt(?:-get)? install tesseract/u);
  assert.equal(workflow.match(/COMPUTE_MEMORY_PROFILE: github-hosted-ubuntu-24\.04/gu)?.length, 2);
  assert.match(workflow, /\.peakRssLimitBytes == 805306368/u);
  assert.match(workflow, /\.repeatDriftBytes < 67108864/u);
  assert.doesNotMatch(workflow, /build-tesseract-runtime\.sh runtime\/tesseract/u);

  const protectedJob = workflow.split("\n  metadata-suggestion:")[1] ?? "";
  assert.match(protectedJob, /readonly STAGING_ROOT="output\/worker-stage"/u);
  assert.match(protectedJob, /readonly RUNTIME_ROOT="output\/worker"/u);
  assert.match(protectedJob, /mkdir -p "\$STAGING_ROOT\/runtime"/u);
  assert.match(protectedJob, /build-tesseract-runtime\.sh "\$STAGING_ROOT\/runtime\/tesseract"/u);
  assert.match(protectedJob, /verifyTesseractRuntime\(process\.cwd\(\) \+ '\/\$STAGING_ROOT'\)/u);
  assert.match(protectedJob, /mv "\$STAGING_ROOT" "\$RUNTIME_ROOT"/u);
  const cleanIndex = protectedJob.indexOf('rm -rf "$STAGING_ROOT" "$RUNTIME_ROOT"');
  const stageIndex = protectedJob.indexOf('mkdir -p "$STAGING_ROOT/runtime"');
  const buildIndex = protectedJob.indexOf('build-tesseract-runtime.sh "$STAGING_ROOT/runtime/tesseract"');
  const verifyIndex = protectedJob.indexOf("verifyTesseractRuntime(process.cwd() + '/$STAGING_ROOT')");
  const promoteIndex = protectedJob.indexOf('mv "$STAGING_ROOT" "$RUNTIME_ROOT"');
  assert.ok(cleanIndex >= 0 && cleanIndex < stageIndex);
  assert.ok(stageIndex < buildIndex);
  assert.ok(buildIndex < verifyIndex);
  assert.ok(verifyIndex < promoteIndex);
  assert.equal(protectedJob.match(/\$\{\{ github\.workspace \}\}\/output\/worker\/runtime\/tesseract/gu)?.length, 3);
  assert.match(protectedJob, /verifyTesseractRuntime\(process\.cwd\(\) \+ '\/output\/worker'\)/u);
});
