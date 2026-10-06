import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOCAL_OCR_BOOK_FEATURE as FEATURE, LOCAL_OCR_BOOK_LIMITS as LIMIT, type LocalOcrBookClaim,
  type LocalOcrBookJob, type LocalOcrBookPageInput, type LocalOcrResult } from '@academiccloud/compute-contracts';
import { LocalOcrService } from '../../src/local-ocr/service.js';
import { SqliteLocalOcrRepository } from '../../src/persistence/sqlite/local-ocr-repository.js';
import { SqlitePersistence } from '../../src/persistence/sqlite/persistence.js';
import { SqliteWorkspaceRepository } from '../../src/persistence/sqlite/workspace-repository.js';
import { openSqliteDatabase } from '../../src/persistence/sqlite/database.js';
import { httpFixture, MEMBER, OWNER, OTHER, ROOT, ORIGIN, machine, png } from './helpers.js';

type Fixture=Awaited<ReturnType<typeof httpFixture>>;
async function start(f:Fixture,pages=2,source=f.file('book'),account=MEMBER.id) {
  const connection=await f.connect(account,[FEATURE]);
  const input={clientRequestId:`start-${source.resourceId}`,deviceId:connection.device.id,resourceId:source.resourceId,sourceId:source.sourceId,pageCount:pages};
  const response=await f.request(account,'POST',`${ROOT}/books`,input);
  assert.equal(response.statusCode,200,response.body);
  return {connection,input,job:response.json<{job:LocalOcrBookJob}>().job};
}
async function claim(f:Fixture,token:string,pageCount=2) {
  const response=await f.deviceRequest(token,'GET','book-claim');
  assert.equal(response.statusCode,200,response.body);
  const claimed=response.json<{job:LocalOcrBookClaim}>().job;
  assert.ok(claimed);
  const heartbeat=await f.deviceRequest(token,'POST','book-heartbeat',{bookId:claimed.job.id,attemptId:claimed.attemptId,pageCount});
  assert.equal(heartbeat.statusCode,200,heartbeat.body);
  return claimed;
}
function page(claimed:LocalOcrBookClaim,physicalPage=1):LocalOcrBookPageInput {
  return {bookId:claimed.job.id,attemptId:claimed.attemptId,physicalPage,imageBase64:png().toString('base64'),imageWidth:100,imageHeight:200,rotation:0,
    result:machine(`${claimed.job.id}-${physicalPage}`)};
}
function retained(f:Fixture,job:LocalOcrBookJob,id:string,physicalPage:number):LocalOcrResult {
  return {id,deviceId:job.deviceId,resourceId:job.resourceId,sourceId:job.sourceId,physicalPage,imageWidth:100,imageHeight:200,rotation:0,imageSha256:'a'.repeat(64),
    origin:'client_rendered_unverified',machine:machine(id),correctedText:null,revision:1,createdAt:f.now().toISOString(),updatedAt:f.now().toISOString()};
}

test('book HTTP is account-private including Owner, CSRF protected, filtered and metadata-only',async context => {
  const f=await httpFixture(context),s=await start(f);
  assert.equal((await f.app.inject({method:'GET',url:`${ROOT}/books`})).statusCode,401);
  for (const actor of [OWNER,OTHER]) {
    assert.deepEqual((await f.request(actor.id,'GET',`${ROOT}/books`)).json(),{jobs:[]});
    for (const suffix of ['', '/pause','/cancel','/resume']) assert.equal((await f.request(actor.id,suffix?'POST':'GET',`${ROOT}/books/${s.job.id}${suffix}`,suffix==='/resume'?{deviceId:s.job.deviceId}:suffix?{}:undefined)).statusCode,404);
  }
  const list=await f.request(MEMBER.id,'GET',`${ROOT}/books?resourceId=book&sourceId=${s.job.sourceId}`);
  assert.equal(list.statusCode,200);assert.equal(list.json().jobs[0].id,s.job.id);
  assert.doesNotMatch(list.body,/accountId|authRevision|attemptId|capabilities|imageBase64|OCR_PRIVATE_SENTINEL/);
  assert.equal((await f.request(MEMBER.id,'GET',`${ROOT}/books?accountId=${OWNER.id}`)).statusCode,400);
  assert.equal((await f.app.inject({method:'POST',url:`${ROOT}/books/${s.job.id}/pause`,headers:{cookie:f.cookies[MEMBER.id]},payload:{}})).statusCode,403);
  assert.equal((await f.request(MEMBER.id,'POST',`${ROOT}/books`,{...s.input,pageCount:501})).statusCode,400);
});

test('old connector defaults to no PDF transport; feature remains separate from engine capabilities',async context => {
  const f=await httpFixture(context),source=f.file('legacy'),old=await f.connect();
  assert.deepEqual(old.device.transportFeatures,[]);
  assert.equal((await f.deviceRequest(old.deviceToken,'GET','book-claim')).json().job,null);
  assert.equal((await f.request(MEMBER.id,'POST',`${ROOT}/books`,{clientRequestId:'legacy',deviceId:old.device.id,resourceId:source.resourceId,sourceId:source.sourceId,pageCount:1})).json().error,'device_unavailable');
  const current=await f.claimed(old,source.resourceId,source.sourceId);
  assert.equal(f.service.complete(old.deviceToken,{jobId:current.id,attemptId:current.attemptId,result:machine(current.id)}).accepted,true);
  assert.deepEqual(f.service.devices(MEMBER.id)[0]!.transportFeatures,[]);
});

test('normal web sign-out leaves the own-device book lease running and permits saved completion',async context=>{
  const f=await httpFixture(context),s=await start(f),c=await claim(f,s.connection.deviceToken);
  assert.equal((await f.request(MEMBER.id,'POST','/api/auth/logout',{})).statusCode,204);
  assert.equal((await f.request(MEMBER.id,'GET',`${ROOT}/books/${s.job.id}`)).statusCode,401);
  for(const physicalPage of [1,2]) {
    const ack=await f.deviceRequest(s.connection.deviceToken,'POST','book-page',page(c,physicalPage));
    assert.equal(ack.statusCode,200,ack.body);
  }
  const response=await f.deviceRequest(s.connection.deviceToken,'POST','book-finish',{bookId:s.job.id,attemptId:c.attemptId,pageCount:2});
  assert.equal(response.statusCode,200,response.body);assert.equal(response.json().job.state,'succeeded');
});

test('book create is idempotent, current-page capacity is shared, pause/resume/cancel keep results and invalidate attempts',async context => {
  const f=await httpFixture(context),s=await start(f),c=await claim(f,s.connection.deviceToken);
  assert.equal((await f.request(MEMBER.id,'POST',`${ROOT}/books`,s.input)).json().job.id,s.job.id);
  assert.equal((await f.request(MEMBER.id,'POST',`${ROOT}/books`,{...s.input,pageCount:3})).json().error,'idempotency_conflict');
  assert.throws(()=>f.service.createRequest(MEMBER.id,f.input(s.connection,s.job.resourceId,s.job.sourceId)),/limit_exceeded/);
  assert.equal(f.service.bookProgress(MEMBER.id,s.input).accountBusy,true);
  const saved=f.service.pageBook(s.connection.deviceToken,page(c));
  const paused=f.service.controlBook(MEMBER.id,s.job.id,'pause');
  assert.equal(paused.state,'paused');assert.deepEqual(paused.savedPhysicalPages,[1]);
  assert.throws(()=>f.service.pageBook(s.connection.deviceToken,page(c,2)),/request_inactive/);
  const current=f.service.createRequest(MEMBER.id,f.input(s.connection,s.job.resourceId,s.job.sourceId));
  assert.throws(()=>f.service.controlBook(MEMBER.id,s.job.id,'resume',s.job.deviceId),/limit_exceeded/);
  f.service.cancel(MEMBER.id,current.id);
  f.service.controlBook(MEMBER.id,s.job.id,'resume',s.job.deviceId);
  const again=await claim(f,s.connection.deviceToken);
  assert.notEqual(again.attemptId,c.attemptId);assert.deepEqual(again.savedPhysicalPages,[1]);
  assert.equal(f.localRepository.countBookJobs(MEMBER.id),1);
  f.service.controlBook(MEMBER.id,s.job.id,'cancel');
  assert.throws(()=>f.service.pageBook(s.connection.deviceToken,page(again,2)),/request_inactive/);
  assert.equal(f.service.result(MEMBER.id,saved.resultId).machine.text,'OCR_PRIVATE_SENTINEL');
});

test('retained-job bound blocks new keys for already-saved books while exact create replay still succeeds',async context=>{
  const f=await httpFixture(context),source=f.file('saved-history'),connection=await f.connect(MEMBER.id,[FEATURE]);
  const current=await f.claimed(connection,source.resourceId,source.sourceId);
  f.service.complete(connection.deviceToken,{jobId:current.id,attemptId:current.attemptId,result:machine(current.id)});
  const input={clientRequestId:'history-0',deviceId:connection.device.id,resourceId:source.resourceId,sourceId:source.sourceId,pageCount:1};
  const original=f.service.startBook(MEMBER.id,input);
  for(let i=1;i<LIMIT.maxRetainedJobsPerAccount;i++) {
    const job=f.service.startBook(MEMBER.id,{...input,clientRequestId:`history-${i}`});
    assert.equal(job.state,'succeeded');assert.deepEqual(job.savedPhysicalPages,[1]);
  }
  assert.equal(f.localRepository.countBookJobs(MEMBER.id),100);
  assert.equal(f.service.books(MEMBER.id).length,100);
  const rejected=await f.request(MEMBER.id,'POST',`${ROOT}/books`,{...input,clientRequestId:'one-too-many'});
  assert.equal(rejected.statusCode,429);assert.equal(rejected.json().error,'limit_exceeded');
  assert.deepEqual(f.service.startBook(MEMBER.id,input),original);
  assert.equal(f.localRepository.countResults(MEMBER.id),1);
  assert.equal(f.database.prepare<[],{count:number}>('SELECT count(*) AS count FROM personal_local_ocr_book_page_receipts').get()!.count,0);
  assert.equal(f.localRepository.countBookJobs(OWNER.id),0);
});

test('result/receipt atomic commit and uncertain acknowledgement reuse one result without charging twice',async context => {
  const f=await httpFixture(context),s=await start(f),c=await claim(f,s.connection.deviceToken),input=page(c);
  const insert=f.localRepository.saveBookReceipt.bind(f.localRepository);
  f.localRepository.saveBookReceipt=()=>{throw new Error('synthetic receipt failure');};
  assert.throws(()=>f.service.pageBook(s.connection.deviceToken,input),/synthetic receipt/);
  assert.equal(f.localRepository.countResults(MEMBER.id),0);assert.equal(f.localRepository.bookReceipt(s.job.id,1),null);
  f.localRepository.saveBookReceipt=insert;
  const ack=f.service.pageBook(s.connection.deviceToken,input);
  assert.deepEqual(f.service.pageBook(s.connection.deviceToken,input),ack);assert.equal(f.localRepository.countResults(MEMBER.id),1);
  assert.throws(()=>f.service.pageBook(s.connection.deviceToken,{...input,result:machine(input.result.requestId,'different')}),/idempotency_conflict/);
  const row=f.database.prepare('SELECT * FROM personal_local_ocr_book_page_receipts').get();
  assert.doesNotMatch(JSON.stringify(row),/OCR_PRIVATE_SENTINEL|imageBase64|machine_json/);
  assert.doesNotMatch(f.logs.join(''),/OCR_PRIVATE_SENTINEL/);
});

test('latest existing results and human corrections are skipped without overwriting; finish requires all pages',async context => {
  const f=await httpFixture(context),s=await start(f,4);
  f.localRepository.saveResult(MEMBER.id,retained(f,s.job,'historical-page4',4));
  f.service.correct(MEMBER.id,'historical-page4',{revision:1,correctedText:'MY_PRIVATE_CORRECTION'});
  const original=f.service.result(MEMBER.id,'historical-page4'),c=await claim(f,s.connection.deviceToken,4);
  assert.deepEqual(c.savedPhysicalPages,[4]);
  assert.throws(()=>f.service.pageBook(s.connection.deviceToken,page(c,4)),/idempotency_conflict/);
  assert.throws(()=>f.service.finishBook(s.connection.deviceToken,{bookId:s.job.id,attemptId:c.attemptId,pageCount:4}),/request_inactive/);
  for(let p=1;p<=3;p++) f.service.pageBook(s.connection.deviceToken,page(c,p));
  const done=f.service.finishBook(s.connection.deviceToken,{bookId:s.job.id,attemptId:c.attemptId,pageCount:4});
  assert.equal(done.state,'succeeded');assert.deepEqual(done.savedPhysicalPages,[1,2,3,4]);
  assert.deepEqual(f.service.result(MEMBER.id,'historical-page4'),original);
});

test('PDF count must be confirmed before a page; mismatch fails closed and machine/frame provenance is strict',async context => {
  const f=await httpFixture(context),s=await start(f),c=(await f.deviceRequest(s.connection.deviceToken,'GET','book-claim')).json().job as LocalOcrBookClaim;
  assert.equal((await f.deviceRequest(s.connection.deviceToken,'POST','book-page',page(c))).statusCode,409);
  const mismatch=await f.deviceRequest(s.connection.deviceToken,'POST','book-heartbeat',{bookId:s.job.id,attemptId:c.attemptId,pageCount:3});
  assert.equal(mismatch.statusCode,400);assert.equal(f.service.book(MEMBER.id,s.job.id).errorCode,'invalid_result');
  f.service.controlBook(MEMBER.id,s.job.id,'resume',s.job.deviceId);
  const again=await claim(f,s.connection.deviceToken),input=page(again);
  for(const bad of [{...input,imageWidth:101},{...input,imageBase64:'!'.repeat(44)},{...input,result:machine('wrong')},
    {...input,result:{...input.result,provenance:{...input.result.provenance,engineVersion:'wrong'}}}]) {
    assert.equal((await f.deviceRequest(s.connection.deviceToken,'POST','book-page',bad)).statusCode,400);
  }
  assert.equal(f.localRepository.countResults(MEMBER.id),0);
  const failure=f.service.finishBook(s.connection.deviceToken,{bookId:s.job.id,attemptId:again.attemptId,errorCode:'engine_failed',failedPhysicalPage:1});
  assert.equal(failure.state,'failed');assert.equal(failure.failedPhysicalPage,1);
  assert.equal((await f.deviceRequest(s.connection.deviceToken,'GET','book-claim')).json().job,null);
});

test('lease heartbeat extends 90 seconds, restart recovers persisted lease and expiry needs explicit resume',async context => {
  const f=await httpFixture(context),s=await start(f),c=await claim(f,s.connection.deviceToken);
  f.service.pageBook(s.connection.deviceToken,page(c));f.advance(60_000);
  const renewed=f.service.heartbeatBook(s.connection.deviceToken,{bookId:s.job.id,attemptId:c.attemptId});
  assert.equal(Date.parse(renewed.leaseExpiresAt)-f.now().getTime(),90_000);
  const db=openSqliteDatabase(f.database.name),persistence=new SqlitePersistence(db),repo=new SqliteLocalOcrRepository(db);
  try {
  const restarted=new LocalOcrService(persistence,repo,new SqliteWorkspaceRepository(db),f.now,f.storage);
  assert.equal(restarted.claimBook(s.connection.deviceToken)?.attemptId,c.attemptId);
  f.advance(90_000);assert.equal(restarted.claimBook(s.connection.deviceToken),null);
  assert.equal(restarted.book(MEMBER.id,s.job.id).errorCode,'expired');
  assert.throws(()=>restarted.pageBook(s.connection.deviceToken,page(c,2)),/request_inactive/);
  assert.equal(restarted.pageBook(s.connection.deviceToken,page(c)).resultId,repo.bookReceipt(s.job.id,1)!.resultId);
  // Normal polling makes this same in-memory token/device online for explicit recovery.
  restarted.controlBook(MEMBER.id,s.job.id,'resume',s.job.deviceId);
  assert.notEqual(restarted.claimBook(s.connection.deviceToken)?.attemptId,c.attemptId);
  assert.deepEqual(restarted.book(MEMBER.id,s.job.id).savedPhysicalPages,[1]);
  } finally {db.close();}
});

test('device revoke stops the attempt; normal re-pair and same-account explicit resume can assign another device',async context => {
  const f=await httpFixture(context),s=await start(f),c=await claim(f,s.connection.deviceToken);
  f.service.pageBook(s.connection.deviceToken,page(c));
  f.service.revoke(MEMBER.id,s.job.deviceId);
  assert.equal(f.service.book(MEMBER.id,s.job.id).errorCode,'access_revoked');
  assert.equal((await f.deviceRequest(s.connection.deviceToken,'POST','book-page',page(c,2))).statusCode,401);
  const other=await f.connect(OTHER.id,[FEATURE]);
  assert.throws(()=>f.service.controlBook(MEMBER.id,s.job.id,'resume',other.device.id),/not_found/);
  const newDevice=await f.connect(MEMBER.id,[FEATURE]);
  assert.equal(f.service.controlBook(MEMBER.id,s.job.id,'resume',newDevice.device.id).deviceId,newDevice.device.id);
  const again=await claim(f,newDevice.deviceToken);assert.deepEqual(again.savedPhysicalPages,[1]);
});

test('source replacement, membership loss and account auth revision invalidate device work and retain accepted pages',async context => {
  for(const loss of ['source','membership','password'] as const) {
    const f=await httpFixture(context),shared=f.sharedFile(`shared-${loss}`),s=await start(f,2,shared.source),c=await claim(f,s.connection.deviceToken);
    const ack=f.service.pageBook(s.connection.deviceToken,page(c));
    if(loss==='source') f.database.prepare("UPDATE files SET object_key='objects/replaced' WHERE id=?").run(s.job.resourceId);
    if(loss==='membership') f.database.prepare('DELETE FROM library_memberships WHERE library_id=? AND account_id=?').run(shared.library.id,MEMBER.id);
    if(loss==='password') {
      const account=f.persistence.repositories.accounts.findById(MEMBER.id)!;
      f.persistence.repositories.accounts.updatePassword(MEMBER.id,account.passwordHash,account.authRevision,'test:new',f.now());
    }
    assert.ok((await f.deviceRequest(s.connection.deviceToken,'POST','book-page',page(c,2))).statusCode>=400);
    assert.ok((await f.deviceRequest(s.connection.deviceToken,'POST','book-heartbeat',{bookId:s.job.id,attemptId:c.attemptId})).statusCode>=400);
    assert.ok((await f.deviceRequest(s.connection.deviceToken,'POST','book-source',{bookId:s.job.id,attemptId:c.attemptId})).statusCode>=400);
    assert.equal(f.localRepository.result(MEMBER.id,ack.resultId)!.machine.text,'OCR_PRIVATE_SENTINEL');
    assert.equal(f.localRepository.bookJob(MEMBER.id,s.job.id)!.state,'failed');
  }
});

test('source grant is adapter-backed, fixed attachment/300s, rejects metadata mismatch and rechecks after async signing',async context => {
  const f=await httpFixture(context),s=await start(f),c=await claim(f,s.connection.deviceToken),input={bookId:s.job.id,attemptId:c.attemptId};
  const sign=f.storage.createDownloadAuthorization.bind(f.storage);let captured:unknown;
  f.storage.createDownloadAuthorization=async input=>{captured=input;return sign(input);};
  const response=await f.deviceRequest(s.connection.deviceToken,'POST','book-source',input);
  assert.equal(response.statusCode,200,response.body);assert.equal(response.json().sizeBytes,42);
  assert.deepEqual(captured,{objectKey:f.persistence.repositories.files.findById(MEMBER.id,s.job.resourceId)!.objectKey,
    downloadFilename:'academiccloud-private-ocr-source.pdf',disposition:'attachment',expiresInSeconds:300});
  assert.equal(response.json().checksumAlgorithm,'md5');assert.equal(response.json().checksum,'AAAAAAAAAAAAAAAAAAAAAA==');
  f.storage.createDownloadAuthorization=async input=>{const grant=await sign(input);f.service.controlBook(MEMBER.id,s.job.id,'pause');return grant;};
  const rejected=await f.deviceRequest(s.connection.deviceToken,'POST','book-source',input);
  assert.equal(rejected.statusCode,409);assert.doesNotMatch(rejected.body,/memory:\/\/download/);
  f.service.controlBook(MEMBER.id,s.job.id,'resume',s.job.deviceId);const again=await claim(f,s.connection.deviceToken);
  f.storage.statObject=async()=>null;
  assert.equal((await f.deviceRequest(s.connection.deviceToken,'POST','book-source',{bookId:s.job.id,attemptId:again.attemptId})).statusCode,404);
});

test('async source signing cannot return a grant after source, credential or device authority changes',async context=>{
  for(const loss of ['source','password','device'] as const) {
    const f=await httpFixture(context),s=await start(f),c=await claim(f,s.connection.deviceToken);
    const sign=f.storage.createDownloadAuthorization.bind(f.storage);
    f.storage.createDownloadAuthorization=async input=>{
      const grant=await sign(input);
      if(loss==='source') f.database.prepare("UPDATE files SET object_key='objects/changed-during-signing' WHERE id=?").run(s.job.resourceId);
      if(loss==='device') f.service.revoke(MEMBER.id,s.job.deviceId);
      if(loss==='password') {
        const account=f.persistence.repositories.accounts.findById(MEMBER.id)!;
        f.persistence.repositories.accounts.updatePassword(MEMBER.id,account.passwordHash,account.authRevision,'test:new',f.now());
      }
      return grant;
    };
    const response=await f.deviceRequest(s.connection.deviceToken,'POST','book-source',{bookId:s.job.id,attemptId:c.attemptId});
    assert.ok(response.statusCode>=400);assert.doesNotMatch(response.body,/memory:\/\/download/);
    assert.doesNotMatch(f.logs.join(''),/memory:\/\/download/);
  }
});

test('preflight and completion enforce actual missing-page quota without eviction or stale quota reservation',async context => {
  const f=await httpFixture(context),s=await start(f),c=await claim(f,s.connection.deviceToken);
  for(let i=1;i<=499;i++) f.localRepository.saveResult(MEMBER.id,{...retained(f,s.job,`other-history-${i}`,3),physicalPage:3});
  assert.throws(()=>f.service.pageBook(s.connection.deviceToken,page(c)),/limit_exceeded/);
  assert.equal(f.localRepository.countResults(MEMBER.id),499);
  f.service.controlBook(MEMBER.id,s.job.id,'pause');
  assert.throws(()=>f.service.startBook(MEMBER.id,{...s.input,clientRequestId:'new-over-quota'}),/limit_exceeded/);
  // A retained result for one intended page means only one additional result is needed.
  f.localRepository.saveResult(MEMBER.id,retained(f,s.job,'existing-page1',1));
  assert.throws(()=>f.service.controlBook(MEMBER.id,s.job.id,'resume',s.job.deviceId),/limit_exceeded/);
  assert.equal(f.localRepository.countResults(MEMBER.id),500);
});

test('global eight-job and per-account capacity serialize creates across durable repositories',async context => {
  const f=await httpFixture(context),s=await start(f);
  const copy=new LocalOcrService(f.persistence,new SqliteLocalOcrRepository(f.database),f.repository,f.now,f.storage);
  assert.throws(()=>copy.startBook(MEMBER.id,{...s.input,clientRequestId:'racing-create'}),/limit_exceeded/);
  for(let i=1;i<=7;i++) {
    const actor=`capacity-${i}`;f.persistence.repositories.accounts.create({id:actor,loginName:actor,role:'member',state:'active',passwordHash:'test:x',createdAt:f.now(),updatedAt:f.now()});
    const source=f.file(`capacity-source-${i}`,actor);
    const device=copy.connect({pairingCode:copy.pairing(actor,'local').pairingCode,capabilities:s.connection.device.capabilities,
      probeResult:machine('academiccloud-local-ocr-probe','AcademicCloud OCR 2026'),transportFeatures:[FEATURE]});
    copy.claim(device.deviceToken);
    copy.startBook(actor,{clientRequestId:'capacity',deviceId:device.device.id,resourceId:source.resourceId,sourceId:source.sourceId,pageCount:1});
  }
  const otherSource=f.file('capacity-over',OTHER.id),other=await f.connect(OTHER.id,[FEATURE]);
  assert.throws(()=>f.service.startBook(OTHER.id,{clientRequestId:'over',deviceId:other.device.id,resourceId:otherSource.resourceId,sourceId:otherSource.sourceId,pageCount:1}),/limit_exceeded/);
  assert.equal(f.localRepository.activeBookJobs().length,8);
  f.service.controlBook(MEMBER.id,s.job.id,'pause');
  assert.equal(f.service.startBook(OTHER.id,{clientRequestId:'over',deviceId:other.device.id,resourceId:otherSource.resourceId,sourceId:otherSource.sourceId,pageCount:1}).state,'queued');
});

test('seven-day lifetime cannot be renewed by pause/resume or stale attempts',async context => {
  const f=await httpFixture(context),s=await start(f),c=await claim(f,s.connection.deviceToken);
  f.service.pageBook(s.connection.deviceToken,page(c));f.service.controlBook(MEMBER.id,s.job.id,'pause');
  f.advance(LIMIT.taskLifetimeMs);
  assert.throws(()=>f.service.controlBook(MEMBER.id,s.job.id,'resume',s.job.deviceId),/request_inactive/);
  assert.throws(()=>f.service.pageBook(s.connection.deviceToken,page(c,2)),/request_inactive/);
  assert.deepEqual(f.service.book(MEMBER.id,s.job.id).savedPhysicalPages,[1]);
});
