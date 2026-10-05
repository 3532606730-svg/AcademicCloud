import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { openSqliteDatabase } from '../../src/persistence/sqlite/database.js';
import { assertMigrationsCurrent, runMigrations } from '../../src/persistence/sqlite/migrations.js';
import { SqlitePersistence } from '../../src/persistence/sqlite/persistence.js';
import { SqliteLocalOcrRepository } from '../../src/persistence/sqlite/local-ocr-repository.js';
import { SqliteWorkspaceRepository } from '../../src/persistence/sqlite/workspace-repository.js';
import { LocalOcrService } from '../../src/local-ocr/service.js';
import { WorkspaceService } from '../../src/workspace/service.js';
import { AuthService } from '../../src/auth/auth-service.js';
import { createApp } from '../../src/platform/app.js';
import { INITIAL_MIGRATIONS_DIRECTORY } from './helpers.js';
import { capabilities, probe, png, machine } from '../local-ocr/helpers.js';

test('040 preserves complete 039 data, validates startup history and keeps results/corrections through compatible routes-disabled rollback/reopen', async (context) => {
  const dir = mkdtempSync(join(tmpdir(), 'academiccloud-local-ocr-migration-'));
  context.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) if (Number(name.slice(0, 3)) <= 39) copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY, name), join(dir, name));
  const filename = join(dir, 'upgrade.sqlite'); let database = openSqliteDatabase(filename);
  try {
    runMigrations(database, dir);
    let persistence = new SqlitePersistence(database); const now = new Date('2026-10-01T03:00:00Z');
    persistence.repositories.accounts.create({ id: 'ocr-owner', loginName: 'ocr-owner', role: 'owner', state: 'active', passwordHash: 'test:password', createdAt: now, updatedAt: now });
    database.prepare(`INSERT INTO files (id, owner_domain_id, uploaded_by_account_id, display_name, storage_provider, object_key,
      media_type, size_bytes, checksum_algorithm, checksum, state, revision, created_at, updated_at, activated_at)
      VALUES ('pdf', 'account:ocr-owner', 'ocr-owner', 'synthetic.pdf', 'memory', 'objects/synthetic', 'application/pdf', 42,
      'md5', 'AAAAAAAAAAAAAAAAAAAAAA==', 'active', 9, ?, ?, ?)`).run(now.toISOString(), now.toISOString(), now.toISOString());
    const source = persistence.repositories.files.findCurrentDocumentSource('pdf')!;
    let workspace = new WorkspaceService(persistence, new SqliteWorkspaceRepository(database), () => now);
    workspace.createNote('ocr-owner', { resourceId: 'pdf', sourceId: source.sourceId, physicalPage: 2, locator: null, body: 'Retain original authored note' });
    workspace.saveProgress('ocr-owner', 'pdf', { sourceId: source.sourceId, physicalPage: 2, revision: 0 });
    workspace.createHighlight('ocr-owner', { resourceId: 'pdf', sourceId: source.sourceId, physicalPage: 2, text: 'Retain highlight', rects: [{ x: .1, y: .1, width: .2, height: .1 }], color: 'yellow' });
    const exported = [...workspace.exportLines('ocr-owner')];
    const tables = database.prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'schema_migrations' ORDER BY name").all();
    const snapshots = tables.map(({ name }) => ({ name, rows: database.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all() }));
    assert.deepEqual(runMigrations(database, INITIAL_MIGRATIONS_DIRECTORY), { appliedVersions: [40], currentVersion: 40 });
    for (const snapshot of snapshots) assert.deepEqual(database.prepare(`SELECT * FROM "${snapshot.name.replaceAll('"', '""')}"`).all(), snapshot.rows, snapshot.name);
    assert.throws(() => assertMigrationsCurrent(database, dir), /Applied migration 40 is missing/);
    assert.deepEqual(assertMigrationsCurrent(database, INITIAL_MIGRATIONS_DIRECTORY), { appliedVersions: [], currentVersion: 40 });
    const repository = new SqliteLocalOcrRepository(database);
    const service = new LocalOcrService(persistence, repository, new SqliteWorkspaceRepository(database), () => now);
    const pairingCode = service.pairing('ocr-owner', 'My device').pairingCode;
    const connection = service.connect({ pairingCode, capabilities, probeResult: probe });
    service.claim(connection.deviceToken);
    const job = service.createRequest('ocr-owner', { clientRequestId: 'migration-test', deviceId: connection.device.id, resourceId: 'pdf', sourceId: source.sourceId,
      physicalPage: 2, imageBase64: png().toString('base64'), imageWidth: 100, imageHeight: 200, rotation: 0 });
    const claim = service.claim(connection.deviceToken)!;
    const { resultId } = service.complete(connection.deviceToken, { jobId: job.id, attemptId: claim.attemptId, result: machine(job.id) });
    const corrected = service.correct('ocr-owner', resultId!, { revision: 1, correctedText: 'Preserved private correction' });
    service.close(); database.close(); database = openSqliteDatabase(filename); persistence = new SqlitePersistence(database);
    assertMigrationsCurrent(database, INITIAL_MIGRATIONS_DIRECTORY);
    workspace = new WorkspaceService(persistence, new SqliteWorkspaceRepository(database), () => now);
    // Older Core composition has no local-ocr namespace and still opens the complete040 directory.
    const rollback = await createApp({ logger: false, auth: { service: new AuthService({ persistence, now: () => now,
      passwordHasher: { hash: async p => `test:${p}`, verify: async (h, p) => h === `test:${p}` } }), appOrigin: 'http://localhost', environment: 'test' }, workspace: { service: workspace } });
    try {
      assert.equal((await rollback.inject({ method: 'GET', url: '/api/health' })).statusCode, 200);
      assert.equal((await rollback.inject({ method: 'GET', url: '/api/reader/local-ocr/devices' })).statusCode, 404);
      assert.deepEqual([...workspace.exportLines('ocr-owner')], exported);
    } finally { await rollback.close(); }
    const restarted = new LocalOcrService(persistence, new SqliteLocalOcrRepository(database), new SqliteWorkspaceRepository(database), () => now);
    assert.deepEqual(restarted.result('ocr-owner', resultId!), corrected);
    assert.throws(() => restarted.status('ocr-owner', job.id), /not_found/);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(database.prepare<[], { integrity_check: string }>('PRAGMA integrity_check').get()!.integrity_check, 'ok');
  } finally { database.close(); }
});
