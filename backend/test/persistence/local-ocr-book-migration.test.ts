import assert from 'node:assert/strict';
import { copyFileSync,mkdtempSync,readdirSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { LOCAL_OCR_BOOK_FEATURE } from '@academiccloud/compute-contracts';
import { openSqliteDatabase } from '../../src/persistence/sqlite/database.js';
import { runMigrations,assertMigrationsCurrent } from '../../src/persistence/sqlite/migrations.js';
import { SqlitePersistence } from '../../src/persistence/sqlite/persistence.js';
import { SqliteLocalOcrRepository } from '../../src/persistence/sqlite/local-ocr-repository.js';
import { SqliteWorkspaceRepository } from '../../src/persistence/sqlite/workspace-repository.js';
import { LocalOcrService } from '../../src/local-ocr/service.js';
import { INITIAL_MIGRATIONS_DIRECTORY } from './helpers.js';
import { capabilities,machine,probe,png } from '../local-ocr/helpers.js';

test('041 appends book jobs/receipts/features and retains every040 row including historical machine/correction/source identity',context=>{
  const dir=mkdtempSync(join(tmpdir(),'academiccloud-book-migration-'));
  context.after(()=>rmSync(dir,{recursive:true,force:true}));
  for(const name of readdirSync(INITIAL_MIGRATIONS_DIRECTORY)) if(Number(name.slice(0,3))<=40) copyFileSync(join(INITIAL_MIGRATIONS_DIRECTORY,name),join(dir,name));
  const db=openSqliteDatabase(join(dir,'fixture.sqlite'));
  try {
    runMigrations(db,dir);const persistence=new SqlitePersistence(db),now=new Date('2026-10-06T00:00:00Z'),time=now.toISOString();
    persistence.repositories.accounts.create({id:'member',loginName:'member',role:'member',state:'active',passwordHash:'test:password',createdAt:now,updatedAt:now});
    db.prepare(`INSERT INTO files(id,owner_domain_id,uploaded_by_account_id,display_name,storage_provider,object_key,media_type,size_bytes,
      checksum_algorithm,checksum,state,revision,created_at,updated_at,activated_at)
      VALUES('pdf','account:member','member','old.pdf','memory','objects/old','application/pdf',42,'md5','AAAAAAAAAAAAAAAAAAAAAA==','active',1,?,?,?)`).run(time,time,time);
    const source=persistence.repositories.files.findCurrentDocumentSource('pdf')!;
    db.prepare(`INSERT INTO personal_local_ocr_devices(id,account_id,label,token_digest,auth_revision,capabilities,created_at,last_seen_at,token_expires_at)
      VALUES('legacy','member','Legacy',?,0,?,?,?,?)`).run('a'.repeat(64),JSON.stringify(capabilities),time,time,'2026-11-06T00:00:00Z');
    db.prepare(`INSERT INTO personal_local_ocr_results(id,account_id,device_id,file_id,source_id,physical_page,image_width,image_height,rotation,image_sha256,
      origin,machine_json,corrected_text,revision,created_at,updated_at) VALUES('old-result','member','legacy','pdf',?,1,100,200,0,?,
      'client_rendered_unverified',?,'HUMAN_PRIVATE_CORRECTION',2,?,?)`).run(source.sourceId,'b'.repeat(64),JSON.stringify(machine('old-result')),time,time);
    const tables=db.prepare<[],{name:string}>("SELECT name FROM sqlite_master WHERE type='table' AND name!='schema_migrations' ORDER BY name").all();
    const snapshots=tables.map(({name})=>({name,rows:db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()}));
    assert.deepEqual(runMigrations(db,INITIAL_MIGRATIONS_DIRECTORY),{appliedVersions:[41],currentVersion:41});
    for(const snapshot of snapshots) {
      const actual=db.prepare(`SELECT * FROM "${snapshot.name.replaceAll('"','""')}"`).all();
      const expected=snapshot.name==='personal_local_ocr_devices'?snapshot.rows.map(row=>({...row as object,transport_features:'[]'})):snapshot.rows;
      assert.deepEqual(actual,expected,snapshot.name);
    }
    assert.throws(()=>assertMigrationsCurrent(db,dir),/Applied migration 41 is missing/);
    assert.deepEqual(assertMigrationsCurrent(db,INITIAL_MIGRATIONS_DIRECTORY),{appliedVersions:[],currentVersion:41});
    const repo=new SqliteLocalOcrRepository(db),service=new LocalOcrService(persistence,repo,new SqliteWorkspaceRepository(db),()=>now);
    const original=service.result('member','old-result');assert.equal(original.correctedText,'HUMAN_PRIVATE_CORRECTION');
    assert.deepEqual(service.devices('member')[0]!.transportFeatures,[]);
    assert.throws(()=>db.prepare("UPDATE personal_local_ocr_devices SET transport_features='[\"pdf_book_v1\"]' WHERE id='legacy'").run(),/transport identity/);
    const device=service.connect({pairingCode:service.pairing('member','Book device').pairingCode,capabilities,probeResult:probe,transportFeatures:[LOCAL_OCR_BOOK_FEATURE]});
    service.claimBook(device.deviceToken);
    const job=service.startBook('member',{clientRequestId:'upgrade-book',deviceId:device.device.id,resourceId:'pdf',sourceId:source.sourceId,pageCount:2});
    const claim=service.claimBook(device.deviceToken)!;
    service.heartbeatBook(device.deviceToken,{bookId:job.id,attemptId:claim.attemptId,pageCount:2});
    assert.deepEqual(claim.savedPhysicalPages,[1]);
    const input={bookId:job.id,attemptId:claim.attemptId,physicalPage:2,imageBase64:png().toString('base64'),imageWidth:100,imageHeight:200,rotation:0 as const,result:machine(`${job.id}-2`)};
    const receipt=service.pageBook(device.deviceToken,input);
    assert.deepEqual(service.pageBook(device.deviceToken,input),receipt);
    assert.deepEqual(service.result('member','old-result'),original);
    assert.equal(service.finishBook(device.deviceToken,{bookId:job.id,attemptId:claim.attemptId,pageCount:2}).state,'succeeded');
    assert.throws(()=>db.prepare("UPDATE personal_local_ocr_book_jobs SET page_count=3 WHERE id=?").run(job.id),/book identity/);
    assert.throws(()=>db.prepare("UPDATE personal_local_ocr_book_page_receipts SET payload_digest=? WHERE job_id=?").run('c'.repeat(64),job.id),/receipt is immutable/);
    assert.throws(()=>db.prepare('DELETE FROM personal_local_ocr_book_page_receipts WHERE job_id=?').run(job.id),/receipt must be retained/);
    const columns=db.prepare<[],{name:string}>('PRAGMA table_info(personal_local_ocr_book_page_receipts)').all().map(row=>row.name);
    assert.deepEqual(columns,['job_id','physical_page','result_id','accepted_attempt_id','payload_digest','created_at']);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(db.prepare<[],{integrity_check:string}>('PRAGMA integrity_check').get()!.integrity_check,'ok');
  } finally {db.close();}
});
