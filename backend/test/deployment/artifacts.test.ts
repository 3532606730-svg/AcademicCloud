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

test("Local Pull systemd runs only the immutable D-drive WSL release with outbound GPU access", () => {
  const unit = read("deployment/systemd/academiccloud-local-compute.service");
  const environment = read("deployment/env/academiccloud-local-compute.env.example");
  const assembler = read("scripts/local-compute/assemble-local-compute-release.sh");
  const activation = read("scripts/local-compute/activate-local-compute-release.sh");

  for (const directive of [
    "User=academiccloud",
    "WorkingDirectory=/srv/academiccloud-compute/current/compute",
    "EnvironmentFile=/srv/academiccloud-compute/control/academiccloud-local-compute.env",
    "ExecStart=/srv/academiccloud-compute/current/runtime/node/bin/node /srv/academiccloud-compute/current/compute/dist/local-pull-main.js",
    "UMask=0077",
    "Nice=5",
    "NoNewPrivileges=true",
    "PrivateTmp=true",
    "ProtectSystem=strict",
    "ReadWritePaths=/srv/academiccloud-compute/logs /srv/academiccloud-compute/tmp",
    "MemoryHigh=6G",
    "MemoryMax=7G",
    "Restart=on-failure",
    "KillMode=control-group",
    "SendSIGKILL=yes",
  ]) {
    assert.ok(unit.includes(directive), `missing ${directive}`);
  }
  assert.doesNotMatch(unit, /PrivateDevices=true|D:\\Projects\\AcademicCloud|npm run|tsx/u);
  assert.match(environment, /^NODE_ENV=production$/m);
  assert.match(environment, /^ACADEMICCLOUD_COMPUTE_CORE_BASE_URL=https:\/\//m);
  assert.match(environment, /^ACADEMICCLOUD_COMPUTE_MODE=NORMAL$/m);
  assert.match(environment, /^ACADEMICCLOUD_COMPUTE_IDLE_TTL_MILLISECONDS=300000$/m);
  assert.match(environment, /^PADDLE_OCR_DEVICE=gpu$/m);
  assert.match(environment, /^BIBLIOGRAPHY_LLAMA_GPU_LAYERS=999$/m);
  assert.match(environment, /^ACADEMICCLOUD_COMPUTE_BOOTSTRAP_SECRET=replace-through-secret-installation$/m);
  assert.doesNotMatch(environment, /GITHUB_|BEGIN PRIVATE KEY|ac_session=/u);
  assert.match(assembler, /SOURCE_COMMIT.*\^\[a-f0-9\]\{40\}\$/u);
  assert.match(assembler, /npm ci --workspace @academiccloud\/compute-contracts --workspace @academiccloud\/compute/u);
  assert.match(assembler, /--include-workspace-root=true/u);
  assert.match(assembler, /npm ci --omit=dev --workspace @academiccloud\/compute-contracts --workspace @academiccloud\/compute/u);
  assert.match(assembler, /--include-workspace-root=false/u);
  assert.match(assembler, /QWEN_SHA256="061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a"/u);
  assert.match(assembler, /LLAMA_SOURCE_REVISION="de699957b92f490efebad149665b0dccf127eaff"/u);
  assert.match(assembler, /find \. -type f ! -name release-files\.sha256/u);
  assert.match(activation, /sha256sum --check --strict release-files\.sha256/u);
  assert.match(activation, /ln -sfn "\$RELEASE_ROOT"/u);
  assert.match(activation, /mv -Tf/u);
  assert.match(activation, /systemctl enable academiccloud-local-compute\.service/u);
  assert.match(activation, /systemctl restart academiccloud-local-compute\.service/u);
  assert.match(activation, /readonly STABILITY_SECONDS=15/u);
  assert.match(activation, /--property=NRestarts/u);
  assert.match(activation, /Result=success/u);
  assert.match(activation, /User=academiccloud/u);
  assert.match(activation, /FragmentPath=\$UNIT_TARGET/u);
  assert.match(activation, /PREVIOUS_RELEASE/u);
  assert.match(activation, /rollback-current/u);
  assert.doesNotMatch(`${assembler}\n${activation}`, /git (?:pull|clone)|github_actions|D:\\Projects\\AcademicCloud/u);
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
  assert.match(artifact, /"compute-contracts\/dist\/bibliography\.js"/u);
  assert.match(artifact, /schemaVersion: 3/u);
  assert.match(artifact, /coreOcrRuntime: false/u);
  assert.match(artifact, /corePdfRenderRuntime: false/u);
  assert.doesNotMatch(artifact, /verifyTesseractRuntime|verifyIntelligentComputeRuntime|verifyPdfJsRuntime|runtime\/(?:tesseract|paddle|qwen|llama)/u);
  assert.doesNotMatch(backendPackage, /pdfjs-dist|@napi-rs\/canvas|tesseract|paddle|qwen|llama/iu);
  assert.doesNotMatch(workflow, /build-(?:tesseract|intelligent-compute)-runtime|realistic-(?:ocr|paddle-ocr)-e2e|runtime\/(?:tesseract|paddle|qwen|llama)/iu);
  assert.match(workflow, /--workspace @academiccloud\/backend --workspace @academiccloud\/compute-contracts/u);
  assert.match(workflow, /Core OCR\/PDF-render runtime/u);
});

test("Compute workflow owns the exact release-local PaddleOCR/Qwen boundary and bounded worker controls", () => {
  const runtime = read("scripts/verify-intelligent-compute-runtime.mjs");
  const builder = read("scripts/build-intelligent-compute-runtime.sh");
  const sidecar = read("compute/scripts/paddle_ocr_sidecar.py");
  const workflow = read(".github/workflows/derived-compute-worker.yml");

  assert.match(runtime, /paddle: "3\.3\.1"/u);
  assert.match(runtime, /paddleocr: "3\.7\.0"/u);
  assert.match(runtime, /qwen: "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a"/u);
  assert.match(runtime, /llamaAsset: "78ec7a1964710918030e85c132a0995b10b07e4f43001bdf54fe0fd48d1eb85b"/u);
  assert.match(builder, /PADDLE_WHEEL_SHA256="9016fc497213e1101261684321fbb31ef5960019ef39cb07ded27bc70e2a9858"/u);
  assert.match(builder, /PADDLEOCR_WHEEL_SHA256="c0f0a81ad4112727f30c6fcf986ac0ef6a120d31ee0991a01fae0357ee32d338"/u);
  assert.match(builder, /DET_REVISION="106c97591b235f607453300d9fc8c1cad1b25488"/u);
  assert.match(builder, /REC_REVISION="bd619643acac4b9650c040234da8d944476ee3f1"/u);
  assert.match(builder, /QWEN_REVISION="90862c4b9d2787eaed51d12237eafdfe7c5f6077"/u);
  assert.match(builder, /QWEN_VL_REVISION="52d6c8ffea26cc873ac5ad116f8631268d7eb503"/u);
  assert.match(builder, /QWEN_VL_Q4_SHA256="089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae"/u);
  assert.match(builder, /QWEN_VL_MMPROJ_Q8_SHA256="f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82"/u);
  assert.match(builder, /LLAMA_VERSION="b10218"/u);
  assert.match(sidecar, /text_detection_model_name="PP-OCRv6_small_det"/u);
  assert.match(sidecar, /text_recognition_model_name="PP-OCRv6_small_rec"/u);
  assert.match(builder, /pip freeze --all/u);
  assert.doesNotMatch(workflow, /actions\/upload-artifact|actions\/cache/u);
  assert.match(workflow, /timeout-minutes: 12/u);
  assert.match(workflow, /group: derived-compute-\$\{\{ inputs\.job_id \}\}/u);
  assert.match(workflow, /ACADEMICCLOUD_COMPUTE_BOOTSTRAP_SECRET/u);
  assert.match(workflow, /ACADEMICCLOUD_COMPUTE_CORE_ORIGIN/u);
  assert.match(workflow, /intelligent-qualification\.ts/u);
  assert.match(workflow, /visual-architecture-qualification\.ts/u);
  assert.equal(workflow.match(/INTELLIGENT_COMPARISON_ASSETS/gu)?.length, 1);
  assert.equal(workflow.match(/PADDLE_OCR_STARTUP_DIAGNOSTICS/gu)?.length, 1);
  assert.match(workflow, /\/usr\/bin\/time -v/u);
  assert.match(workflow, /node --expose-gc output\/worker\/compute\/dist\/main\.js/u);
  assert.doesNotMatch(workflow, /node --expose-gc compute\/dist\/main\.js/u);
  assert.match(workflow, /--core-base-url="\$COMPUTE_INPUT_CORE_ORIGIN"/u);
  assert.match(workflow, /--job-id="\$COMPUTE_INPUT_JOB_ID"/u);
  assert.match(workflow, /--attempt-id="\$COMPUTE_INPUT_ATTEMPT_ID"/u);
  assert.doesNotMatch(workflow, /--(?:core-base-url|job-id|attempt-id)=\$\{\{ inputs\./u);
  assert.match(workflow, /compute\/test\/realistic-paddle-ocr-e2e\.test\.ts/u);
  assert.doesNotMatch(workflow, /TESSERACT_BUILDER_IMAGE|build-tesseract-runtime|realistic-ocr-e2e/u);
  assert.equal(workflow.match(/COMPUTE_MEMORY_PROFILE: github-hosted-ubuntu-24\.04-intelligent/gu)?.length, 2);
  assert.match(workflow, /GNU_MAX_RSS_KB.*-lt 6291456/su);
  assert.doesNotMatch(workflow, /ACADEMICCLOUD_OCR_EMERGENCY_LEGACY/u);

  const protectedJob = workflow.split("\n  metadata-suggestion:")[1] ?? "";
  assert.match(protectedJob, /readonly STAGING_ROOT="output\/worker-stage"/u);
  assert.match(protectedJob, /readonly RUNTIME_ROOT="output\/worker"/u);
  assert.match(protectedJob, /mkdir -p "\$STAGING_ROOT\/compute" "\$STAGING_ROOT\/runtime"/u);
  assert.match(protectedJob, /cp -a compute\/dist "\$STAGING_ROOT\/compute\/dist"/u);
  assert.match(protectedJob, /cp compute\/package\.json "\$STAGING_ROOT\/compute\/package\.json"/u);
  assert.match(protectedJob, /build-intelligent-compute-runtime\.sh "\$STAGING_ROOT\/runtime"/u);
  assert.match(protectedJob, /verify-intelligent-compute-runtime\.mjs "\$STAGING_ROOT\/runtime"/u);
  assert.match(protectedJob, /node --check "\$STAGING_ROOT\/compute\/dist\/main\.js"/u);
  assert.match(protectedJob, /mv "\$STAGING_ROOT" "\$RUNTIME_ROOT"/u);
  const cleanIndex = protectedJob.indexOf('rm -rf "$STAGING_ROOT" "$RUNTIME_ROOT"');
  const stageIndex = protectedJob.indexOf('mkdir -p "$STAGING_ROOT/compute" "$STAGING_ROOT/runtime"');
  const stageWorkerIndex = protectedJob.indexOf('cp -a compute/dist "$STAGING_ROOT/compute/dist"');
  const buildIndex = protectedJob.indexOf('build-intelligent-compute-runtime.sh "$STAGING_ROOT/runtime"');
  const verifyIndex = protectedJob.indexOf('verify-intelligent-compute-runtime.mjs "$STAGING_ROOT/runtime"');
  const verifyWorkerIndex = protectedJob.indexOf('node --check "$STAGING_ROOT/compute/dist/main.js"');
  const promoteIndex = protectedJob.indexOf('mv "$STAGING_ROOT" "$RUNTIME_ROOT"');
  assert.ok(cleanIndex >= 0 && cleanIndex < stageIndex);
  assert.ok(stageIndex < stageWorkerIndex);
  assert.ok(stageWorkerIndex < buildIndex);
  assert.ok(buildIndex < verifyIndex);
  assert.ok(verifyIndex < verifyWorkerIndex);
  assert.ok(verifyWorkerIndex < promoteIndex);
  assert.equal(protectedJob.match(/\$\{\{ github\.workspace \}\}\/output\/worker\/runtime\/paddle/gu)?.length, 4);
  assert.match(protectedJob, /verify-intelligent-compute-runtime\.mjs output\/worker\/runtime/u);
  assert.doesNotMatch(protectedJob, /QWEN_VL|comparison\/qwen-vl|INTELLIGENT_COMPARISON_ASSETS|PADDLE_OCR_STARTUP_DIAGNOSTICS/u);
});
