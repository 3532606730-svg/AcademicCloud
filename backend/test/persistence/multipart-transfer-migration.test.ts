import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runMigrations } from "../../src/persistence/sqlite/migrations.js";
import { SqliteMultipartUploadRepository } from "../../src/persistence/sqlite/multipart-upload-repository.js";
import { INITIAL_MIGRATIONS_DIRECTORY } from "./helpers.js";

const NOW = new Date("2026-08-19T08:00:00.000Z");
const EXPIRES = new Date("2026-08-26T08:00:00.000Z");
const HISTORICAL_MIGRATION_SHA256 = {
  "001_initial_schema.sql": "c475e0754cc554271aa8107b21a7c5a98f460acc55f61509848278f1daaed80d",
  "002_auth_sessions.sql": "63b678d2ca74b126245d9d5ea81875675a38a2a526f3fcabee363568046fbedd",
  "003_file_purging_state.sql": "ba2fd5364ec1c3a50e01da6a905f4e0566c3e7c983acf6fc545ffb5cfd9b55e5",
  "004_file_revision.sql": "d94a858cec2658658263852576ee246877aa353bda646ef9f98198e9e35ea8f0",
  "005_per_user_favorites.sql": "c919752ce27057529c54f30f3f45d07b1ac6b670247a1e088fdff35281532398",
  "006_recycle_groups.sql": "1f7034491b8322e322b134e417da9050d51260ee0a308f7a95d55aa428d9aa20",
  "007_accounts_and_invitations.sql": "d12fcda2c68f55953fe9d6b3b41b629f10b11164ccc4091ca20ab633bbb6addc",
  "008_global_announcements.sql": "038e624f3d66542fb12f6bcb938e3c28ac3e288bed7163640b9d0bf4b9dff4e8",
  "009_governance_audit.sql": "c5ef10eb1033f0ba7dddf72fd22fe227dcb8d60d27c0481d4c8e9fb858b63b63",
  "010_resource_ownership_domains.sql": "b987726e9c2ff5c4d1b5c3a4f91b35a04cc691dc38269603fff02fedb27615e6",
  "011_scholarly_record_identity.sql": "7d83d28deb01acd47026b5ac846026c4323b5fc1121a1d5289c148c84abd9288",
  "012_member_account_archival.sql": "2a43acae5d62a55cbe06d7ea21d32e45a9834ec6bb00745fd6216870b7694b1e",
  "013_announcement_delete_audit.sql": "5b57011d10d51a5a67d3b9267876684839e7a55f4fc45cceef619fd6688c0f1b",
  "014_shared_libraries.sql": "8088e317b17a433e0232ab21784a996728df04be78458a77b1c029d8270ecfea",
  "015_library_contributions.sql": "9073fc2fcc6c49d550875fcc109a10a001ad01102c9b4b3b87aa45f056449d12",
  "016_canonical_shared_library.sql": "4e3adc26fcf533894959fc6d7c28314fadc58fcc14507d2638e6333ea821593f",
  "017_owner_credential_reset.sql": "a2a0847729eff54c0d183a291ab6361679e04af2ea5ac828615c96e36533dbe5",
  "018_canonical_scholarly_metadata.sql": "61911a469d35480d7898c1dbbc322dadc104a5d0c76e688b93a1154a8796b87e",
  "019_bibliographic_metadata_suggestions.sql": "c533d8947f4ab8492673c9872f4f11b5cf55d528bd762d7cf7c9682c137f33ff",
  "020_suggestion_evidence_provenance.sql": "1a6d363d4ff5dd4325adfaac0b54ce64c8c071c0788ac45f98827504d22887eb",
} as const;

function insertPendingFile(database: ReturnType<typeof openSqliteDatabase>, id: string, objectSuffix: string): void {
  const ownerDomain = database.prepare<[], { id: string }>(`
    SELECT id FROM ownership_domains WHERE kind = 'account' AND account_id = 'owner-1'
  `).get()!.id;
  database.prepare(`
    INSERT INTO files (
      id, owner_domain_id, uploaded_by_account_id, folder_id, display_name,
      storage_provider, object_key, media_type, size_bytes, checksum_algorithm,
      checksum, state, revision, created_at, updated_at, activated_at,
      deleted_at, purged_at, recycle_group_id
    ) VALUES (?, ?, 'owner-1', NULL, ?, 'memory', ?, 'application/pdf', 9, 'md5',
      '1B2M2Y8AsgTpgAmY7PhCfg==', 'pending_upload', 0, ?, ?, NULL, NULL, NULL, NULL)
  `).run(id, ownerDomain, `${id}.pdf`, `objects/aa/${objectSuffix.repeat(62)}`, NOW.toISOString(), NOW.toISOString());
}

test("migration 021 upgrades v20 append-only and persists exact CAS-bound multipart state", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "academiccloud-transfer-migration-"));
  const v20Directory = join(temporaryDirectory, "v20");
  mkdirSync(v20Directory);
  for (const filename of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) {
    const version = Number(filename.slice(0, 3));
    if (Number.isSafeInteger(version) && version <= 20) {
      copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, filename), join(v20Directory, filename));
    }
  }
  const database = openSqliteDatabase(join(temporaryDirectory, "transfer.sqlite"));
  try {
    assert.equal(runMigrations(database, v20Directory).currentVersion, 20);
    database.prepare(`
      INSERT INTO accounts (id, login_name, password_hash, role, auth_revision, state, created_at, updated_at)
      VALUES ('owner-1', 'owner-1', 'hash', 'owner', 0, 'active', ?, ?)
    `).run(NOW.toISOString(), NOW.toISOString());
    insertPendingFile(database, "legacy-pending", "b");
    insertPendingFile(database, "multipart-pending", "c");

    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), {
      appliedVersions: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37],
      currentVersion: 37,
    });
    assert.equal(
      database.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM multipart_uploads").get()?.count,
      0,
    );

    const repository = new SqliteMultipartUploadRepository(database);
    assert.equal(repository.findByFileId("owner-1", "legacy-pending"), null);
    const created = repository.create({
      fileId: "multipart-pending",
      ownerId: "owner-1",
      storageProvider: "memory",
      providerUploadId: "provider-upload-1",
      partSizeBytes: 8 * 1024 * 1024,
      totalParts: 1,
      state: "uploading",
      revision: 0,
      createdAt: NOW,
      updatedAt: NOW,
      expiresAt: EXPIRES,
    });
    assert.equal(created.revision, 0);
    assert.equal(repository.update({ ...created, state: "paused" }, "uploading", 1), null);
    const paused = repository.update({ ...created, state: "paused", updatedAt: new Date(NOW.getTime() + 1_000) }, "uploading", 0)!;
    assert.equal(paused.state, "paused");
    assert.equal(paused.revision, 1);
    assert.equal(repository.delete("owner-1", "multipart-pending", 0), false);

    assert.throws(() => database.prepare(`
      INSERT INTO multipart_uploads (
        file_id, owner_domain_id, storage_provider, provider_upload_id,
        part_size_bytes, total_parts, state, revision, created_at, updated_at, expires_at
      ) SELECT 'legacy-pending', id, 'memory', 'bad-size', 102399, 1, 'uploading', 0, ?, ?, ?
        FROM ownership_domains WHERE kind = 'account' AND account_id = 'owner-1'
    `).run(NOW.toISOString(), NOW.toISOString(), EXPIRES.toISOString()), /CHECK constraint failed/);
    assert.throws(() => database.prepare(`
      UPDATE multipart_uploads SET state = 'abandoned' WHERE file_id = 'multipart-pending'
    `).run(), /CHECK constraint failed/);

    const indexes = database.prepare<[], { name: string }>("PRAGMA index_list(multipart_uploads)").all();
    assert.equal(indexes.some((index) => index.name === "multipart_uploads_stale_idx"), true);
    assert.deepEqual(
      database.prepare("SELECT target_type FROM governance_audit_event_kinds WHERE kind = 'drive.upload_abandon'").get(),
      { target_type: "file" },
    );
    assert.equal(database.prepare<[], { integrity_check: string }>("PRAGMA integrity_check").get()?.integrity_check, "ok");
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);

    database.prepare("DELETE FROM files WHERE id = 'multipart-pending'").run();
    assert.equal(repository.findByFileId("owner-1", "multipart-pending"), null);
  } finally {
    database.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("migration 021 leaves migrations 001 through 020 byte-identical", () => {
  for (const [filename, expected] of Object.entries(HISTORICAL_MIGRATION_SHA256)) {
    const actual = createHash("sha256")
      .update(readFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, filename)))
      .digest("hex");
    assert.equal(actual, expected, filename);
  }
});
