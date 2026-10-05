import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createCanvas} from '@napi-rs/canvas';
import {createHash} from 'node:crypto';
import {LOCAL_OCR_PROBE_REQUEST_ID,LOCAL_OCR_PROBE_TEXT,type OcrEngineAdapter,type OcrEnginePageResult} from '@academiccloud/compute-contracts';
import {MemberPaddleAdapter,MEMBER_PADDLE_CAPABILITIES,MemberOcrError,parseMemberPaddleConfig,type MemberPaddleConfig} from '../src/member-paddle.js';
import {exactMemberCoreOrigin,parseMemberDeviceJob,runMemberLocalConnector} from '../src/member-local-ocr.js';
import {parseMemberOcrFlags} from '../src/member-ocr-main.js';
import type {NativeResourceGuard} from '../src/native-resource.js';
const config:MemberPaddleConfig={pythonPath:'/python',sidecarPath:'/sidecar',detectionModelPath:'/det',recognitionModelPath:'/rec',cachePath:'/cache',device:'gpu',nativeResource:{pythonPath:'/python',lockPath:'/lock'}};
function image(){const c=createCanvas(100,80);c.getContext('2d').fillRect(0,0,100,80);return c.toBuffer('image/png');}
function result(id:string,text='sample'):OcrEnginePageResult{return{requestId:id,status:'recognized',text,truncated:false,confidence:90,provenance:{engineId:MEMBER_PADDLE_CAPABILITIES.engineId,engineVersion:MEMBER_PADDLE_CAPABILITIES.engineVersion,modelVersion:MEMBER_PADDLE_CAPABILITIES.modelVersion}};}
function job(){const bytes=image();return{id:'job1',attemptId:'attempt1',leaseExpiresAt:new Date(Date.now()+89_000).toISOString(),resourceId:'resource1',sourceId:'source1',physicalPage:2,
  imageBase64:bytes.toString('base64'),imageSha256:createHash('sha256').update(bytes).digest('hex'),imageWidth:100,imageHeight:80,rotation:0,capabilities:structuredClone(MEMBER_PADDLE_CAPABILITIES)};}
function engine(recognize:OcrEngineAdapter['recognize']):OcrEngineAdapter{return{async capabilities(){return structuredClone(MEMBER_PADDLE_CAPABILITIES);},recognize,async close(){}};}
function guard(order:string[]=[]):NativeResourceGuard{return{async acquire(){order.push('acquire');return{signal:new AbortController().signal,async release(){order.push('release');}};}};}
const connected={deviceToken:'t'.repeat(43),tokenExpiresAt:new Date(Date.now()+24*60*60_000).toISOString(),device:{}};
test('strict flags select one installed/config profile and exact HTTPS origin',()=>{
  assert.deepEqual(parseMemberOcrFlags(['--core','https://core.example','--pair','--detect-installed']),{core:'https://core.example',detectInstalled:true});
  for(const args of [[],['--core','https://core.example','--pair','--detect-installed','--config','/cfg'],['--core','https://core.example','--pair','--detect-installed','--secret','abc']])assert.throws(()=>parseMemberOcrFlags(args));
  for(const v of ['http://core.example','https://core.example/','https://user:secret@core.example','https://core.example/path'])assert.throws(()=>exactMemberCoreOrigin(v));
});
test('configuration rejects command/private extras and relative executable paths',()=>{
  assert.deepEqual(parseMemberPaddleConfig(config),config);
  assert.throws(()=>parseMemberPaddleConfig({...config,bootstrapSecret:'secret'}));
  assert.throws(()=>parseMemberPaddleConfig({...config,pythonPath:'python'}));
  assert.throws(()=>parseMemberPaddleConfig({...config,nativeResource:{...config.nativeResource,sharedHost:true}}));
});
test('claim checks dimensions, canonical base64, digest, capability snapshot, lease and private extras before inference',()=>{
  assert.equal(parseMemberDeviceJob(job(),MEMBER_PADDLE_CAPABILITIES).physicalPage,2);
  for(const patch of [{imageWidth:999},{imageSha256:'a'.repeat(64)},{imageBase64:'?bad'},{leaseExpiresAt:new Date(0).toISOString()},{password:'secret'},
    {capabilities:{...MEMBER_PADDLE_CAPABILITIES,canReturnGeometry:false}}])assert.throws(()=>parseMemberDeviceJob({...job(),...patch},MEMBER_PADDLE_CAPABILITIES));
});
test('invalid PNG never creates native engine and caller abort reason stays private',async()=>{
  let starts=0;const adapter=new MemberPaddleAdapter(config,()=>{starts++;throw Error('private');});
  await assert.rejects(adapter.recognize({requestId:'x',image:Buffer.from('bad'),mimeType:'image/png',languageHints:[]},{signal:new AbortController().signal}),{message:'input_invalid'});
  const c=new AbortController();c.abort('secret');await assert.rejects(adapter.recognize({requestId:'x',image:image(),mimeType:'image/png',languageHints:[]},{signal:c.signal}),{message:'aborted'});
  assert.equal(starts,0);
});
test('fresh adapter per page closes each child; invalid overspan output cannot escape common contract',async()=>{
  let starts=0,closes=0;
  const adapter=new MemberPaddleAdapter(config,()=>{starts++;return{async recognizePage(){return{status:'recognized',text:'a'.repeat(16050),confidence:99,engine:'ignored',geometry:{status:'unavailable'}};},async close(){closes++;}};});
  for(const requestId of ['one','two']){const output=await adapter.recognize({requestId,image:image(),mimeType:'image/png',languageHints:[]},{signal:new AbortController().signal});assert.equal(output.text!.length,16000);assert.equal(output.truncated,true);}
  assert.equal(starts,2);assert.equal(closes,2);await adapter.close();await adapter.close();
});
test('cancel during cold startup closes native adapter and prohibits overlapping page',async()=>{
  let closed=0;const adapter=new MemberPaddleAdapter(config,()=>({async recognizePage(_input,signal){return new Promise((_resolve,reject)=>signal!.addEventListener('abort',()=>reject(Error('raw private traceback')),{once:true}));},async close(){closed++;}}));
  const c=new AbortController();const waiting=adapter.recognize({requestId:'one',image:image(),mimeType:'image/png',languageHints:[]},{signal:c.signal});
  await assert.rejects(adapter.recognize({requestId:'two',image:image(),mimeType:'image/png',languageHints:[]},{signal:c.signal}),{message:'engine_busy'});
  c.abort('private');await assert.rejects(waiting,{message:'aborted'});assert.equal(closed,1);
});
test('native initialization failures are controlled and still close',async()=>{
  let closes=0;const adapter=new MemberPaddleAdapter(config,()=>({async recognizePage(){throw Error('secret raw OCR');},async close(){closes++;}}));
  await assert.rejects(adapter.recognize({requestId:'one',image:image(),mimeType:'image/png',languageHints:[]},{signal:new AbortController().signal}),{message:'engine_failed'});assert.equal(closes,1);
});
test('failed synthetic engine test makes no pairing call',async()=>{
  let calls=0;await assert.rejects(runMemberLocalConnector({coreOrigin:'https://core.example',pairingCode:'p'.repeat(32),engine:engine(async r=>result(r.requestId,'wrong')),
    resourceGuard:guard(),signal:new AbortController().signal,fetch:async()=>{calls++;throw Error();}}),{message:'engine_failed'});assert.equal(calls,0);
});
test('one synthetic probe then claim heartbeats completion carry Origin and session bearer, close before lease release',async()=>{
  const c=new AbortController(),order:string[]=[];let dispatches=0;let polls=0;
  const fakeEngine=engine(async r=>{order.push('nativeClosed');return result(r.requestId,r.requestId===LOCAL_OCR_PROBE_REQUEST_ID?LOCAL_OCR_PROBE_TEXT:'page');});
  await runMemberLocalConnector({coreOrigin:'https://core.example',pairingCode:'p'.repeat(32),engine:fakeEngine,resourceGuard:guard(order),signal:c.signal,pollDelayMs:1,
    fetch:async(url,init)=>{assert.equal(new Headers(init?.headers).get('origin'),'https://core.example');assert.equal(init?.redirect,'error');
      const path=new URL(String(url)).pathname;
      if(path.endsWith('/connect')){assert.equal(new Headers(init?.headers).get('authorization'),null);return Response.json(connected);}
      assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+connected.deviceToken);
      if(path.endsWith('/claim')){polls++;return Response.json({job:job()});}
      if(path.endsWith('/heartbeat'))return Response.json({active:true});
      if(path.endsWith('/complete')){dispatches++;c.abort();return Response.json({accepted:true,resultId:'result1'});}throw Error('unexpected');}});
  assert.equal(polls,1);assert.equal(dispatches,1);assert.ok(order.indexOf('nativeClosed')<order.indexOf('release'));
});
test('busy resource makes no claim and revoked heartbeat cancels original inference without completion',async()=>{
  const c=new AbortController();let completions=0,aborted=false;
  const fakeEngine=engine(async(r,o)=>{if(r.requestId===LOCAL_OCR_PROBE_REQUEST_ID)return result(r.requestId,LOCAL_OCR_PROBE_TEXT);
    return new Promise((_resolve,reject)=>o.signal.addEventListener('abort',()=>{aborted=true;reject(new MemberOcrError('aborted'));},{once:true}));});
  await assert.rejects(runMemberLocalConnector({coreOrigin:'https://core.example',pairingCode:'p'.repeat(32),engine:fakeEngine,resourceGuard:guard(),signal:c.signal,heartbeatMs:1,
    fetch:async(url)=>{const p=String(url);if(p.endsWith('/connect'))return Response.json(connected);if(p.endsWith('/claim'))return Response.json({job:job()});
      if(p.endsWith('/heartbeat'))return new Response('private secret error',{status:403});completions++;return Response.json({accepted:true});}}),{message:'access_revoked'});
  assert.equal(aborted,true);assert.equal(completions,0);
});
test('claimed job with wrong capability never reaches engine or result submission',async()=>{
  const c=new AbortController();let pages=0;
  await runMemberLocalConnector({coreOrigin:'https://core.example',pairingCode:'p'.repeat(32),engine:engine(async r=>{if(r.requestId!==LOCAL_OCR_PROBE_REQUEST_ID)pages++;return result(r.requestId,LOCAL_OCR_PROBE_TEXT);}),
    resourceGuard:guard(),signal:c.signal,onEvent:event=>{if(event.event==='member_ocr.request_failed'){assert.equal(event.code,'protocol_invalid');c.abort();}},
    fetch:async(url)=>String(url).endsWith('/connect')?Response.json(connected):Response.json({job:{...job(),capabilities:{...MEMBER_PADDLE_CAPABILITIES,engineId:'foreign'}}})});
  assert.equal(pages,0);
});
test('cloud-sized/trailing/multiframe PNG rejected before local native factory',async()=>{
  let starts=0;const adapter=new MemberPaddleAdapter(config,()=>{starts++;throw Error();});
  await assert.rejects(adapter.recognize({requestId:'one',image:Buffer.concat([image(),Buffer.from('extra')]),mimeType:'image/png',languageHints:[]},{signal:new AbortController().signal}),{message:'input_invalid'});assert.equal(starts,0);
});
test('idle polling releases native lease before waiting, allowing another participant to enter',async()=>{
  const c=new AbortController();let owned=false,acquires=0,claims=0;
  const shared:NativeResourceGuard={async acquire(){assert.equal(owned,false);owned=true;acquires++;return{signal:new AbortController().signal,async release(){owned=false;if(acquires===2){setTimeout(()=>{assert.equal(owned,false);c.abort();},5);}}};}};
  await runMemberLocalConnector({coreOrigin:'https://core.example',pairingCode:'p'.repeat(32),engine:engine(async r=>result(r.requestId,LOCAL_OCR_PROBE_TEXT)),resourceGuard:shared,signal:c.signal,pollDelayMs:30,
    fetch:async(url)=>{if(String(url).endsWith('/connect'))return Response.json(connected);claims++;return Response.json({job:null});}});
  assert.equal(claims,1);assert.equal(owned,false);
});
test('invalid engine result completes only controlled error, never retains malformed result object',async()=>{
  const c=new AbortController();let completions=0;
  await runMemberLocalConnector({coreOrigin:'https://core.example',pairingCode:'p'.repeat(32),engine:engine(async r=>r.requestId===LOCAL_OCR_PROBE_REQUEST_ID?result(r.requestId,LOCAL_OCR_PROBE_TEXT):({...result(r.requestId),requestId:'foreign'})),
    resourceGuard:guard(),signal:c.signal,fetch:async(url,init)=>{const p=String(url);if(p.endsWith('/connect'))return Response.json(connected);if(p.endsWith('/claim'))return Response.json({job:job()});if(p.endsWith('/heartbeat'))return Response.json({active:true});
      const body=JSON.parse(String(init?.body));assert.equal(body.errorCode,'invalid_result');assert.equal('result' in body,false);completions++;c.abort();return Response.json({accepted:true,resultId:null});}});
  assert.equal(completions,1);
});
test('busy resource after connection never polls a device claim',async()=>{
  const c=new AbortController();let acquired=0,calls=0;
  await runMemberLocalConnector({coreOrigin:'https://core.example',pairingCode:'p'.repeat(32),engine:engine(async r=>result(r.requestId,LOCAL_OCR_PROBE_TEXT)),
    resourceGuard:{async acquire(){acquired++;if(acquired===1)return{signal:new AbortController().signal,async release(){}};c.abort();return null;}},signal:c.signal,
    fetch:async(url)=>{calls++;assert.ok(String(url).endsWith('/connect'));return Response.json(connected);}});assert.equal(calls,1);
});
