import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { LOCAL_OCR_ROOT, LOCAL_OCR_PROBE_REQUEST_ID, LOCAL_OCR_PROBE_TEXT, LOCAL_OCR_LIMITS,
  parseOcrEngineCapabilities, parseOcrEnginePageResult, type LocalOcrConnection, type LocalOcrDeviceJob,
  type OcrEngineAdapter, type OcrEngineCapabilities, type OcrEnginePageResult } from "@academiccloud/compute-contracts";
import { MemberOcrError } from "./member-paddle.js";
import { inspectRenderedPng } from "./rendered-png.js";
import type { NativeResourceGuard } from "./native-resource.js";
import { LOCAL_OCR_BOOK_FEATURE } from "@academiccloud/compute-contracts";
import { parseMemberBookClaim, runMemberBookJob, type MemberBookOptions, type MemberBookEvent } from "./member-book-ocr.js";
import type { BookPdfFactory } from "./member-book-pdf.js";

const ID=/^[A-Za-z0-9_-]{1,128}$/u;
export function exactMemberCoreOrigin(value:string):string {
  try{const url=new URL(value);if(url.origin!==value||url.protocol!=='https:'||url.username||url.password)throw new Error();return value;}
  catch{throw new MemberOcrError('configuration_invalid');}
}
export function syntheticOcrProbe():Uint8Array {
  const canvas=createCanvas(850,160);const context=canvas.getContext('2d');
  context.fillStyle='#fff';context.fillRect(0,0,850,160);context.fillStyle='#000';context.font='44px sans-serif';context.fillText(LOCAL_OCR_PROBE_TEXT,30,90);
  return canvas.toBuffer('image/png');
}
async function jsonResponse(response:Response,maxBytes=3*1024*1024):Promise<{value:unknown;sizeBytes:number}>{
  if(!response.body)throw new MemberOcrError('protocol_invalid');
  const reader=response.body.getReader();const parts:Uint8Array[]=[];let count=0;
  try{for(;;){const next=await reader.read();if(next.done)break;count+=next.value.length;if(count>maxBytes)throw new MemberOcrError('protocol_invalid');parts.push(next.value);}
    return {value:JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown,sizeBytes:count};
  }catch{await reader.cancel().catch(()=>{});throw new MemberOcrError('protocol_invalid');}finally{reader.releaseLock();}
}
function object(value:unknown):Record<string,unknown>{if(typeof value!=='object'||value===null||Array.isArray(value))throw new MemberOcrError('protocol_invalid');return value as Record<string,unknown>;}
function expiry(value:unknown,maxMs:number):number{const n=typeof value==='string'?Date.parse(value):NaN;if(!Number.isFinite(n)||n<=Date.now()||n>Date.now()+maxMs+5000)throw new MemberOcrError('protocol_invalid');return n;}
export function parseMemberDeviceJob(value:unknown,expected:OcrEngineCapabilities):LocalOcrDeviceJob {
  const v=object(value);
  if(Object.keys(v).sort().join(',')!==['id','attemptId','leaseExpiresAt','resourceId','sourceId','physicalPage','imageBase64','imageSha256','imageWidth','imageHeight','rotation','capabilities'].sort().join(','))throw new MemberOcrError('protocol_invalid');
  for(const key of ['id','attemptId','resourceId','sourceId'])if(typeof v[key]!=='string'||!ID.test(v[key] as string))throw new MemberOcrError('protocol_invalid');
  if(!Number.isSafeInteger(v.physicalPage)||Number(v.physicalPage)<1||Number(v.physicalPage)>1_000_000
    ||![0,90,180,270].includes(Number(v.rotation))||typeof v.imageSha256!=='string'||!/^[a-f0-9]{64}$/u.test(v.imageSha256)
    ||typeof v.imageBase64!=='string'||v.imageBase64.length>4*Math.ceil(LOCAL_OCR_LIMITS.maxImageBytes/3)||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(v.imageBase64))throw new MemberOcrError('protocol_invalid');
  expiry(v.leaseExpiresAt,LOCAL_OCR_LIMITS.claimLifetimeMs);
  const bytes=Buffer.from(v.imageBase64,'base64');if(bytes.length===0||bytes.length>LOCAL_OCR_LIMITS.maxImageBytes||createHash('sha256').update(bytes).digest('hex')!==v.imageSha256)throw new MemberOcrError('input_invalid');
  let dimensions;try{dimensions=inspectRenderedPng(bytes);}catch{throw new MemberOcrError('input_invalid');}
  if(dimensions.width!==v.imageWidth||dimensions.height!==v.imageHeight)throw new MemberOcrError('input_invalid');
  try{if(JSON.stringify(parseOcrEngineCapabilities(v.capabilities))!==JSON.stringify(parseOcrEngineCapabilities(expected)))throw new Error();}catch{throw new MemberOcrError('protocol_invalid');}
  return v as unknown as LocalOcrDeviceJob;
}
export interface MemberConnectorOptions {
  coreOrigin:string;
  pairingCode:string;
  engine:OcrEngineAdapter;
  resourceGuard:NativeResourceGuard;
  signal:AbortSignal;
  fetch?:typeof fetch;
  onEvent?:(event:MemberBookEvent)=>void;
  /** Only a PDF-capable connector advertises the separate transport feature. */
  bookSessionFactory?: MemberBookOptions['sessionFactory'];
  bookPdfFactory?: BookPdfFactory;
  /** Offline test control; does not permit concurrent requests or automatic retries. */
  pollDelayMs?:number;
  heartbeatMs?:number;
  /** CLI startup only: bounded wait before its synthetic probe; never retries inference. */
  engineWaitMs?:number;
}
async function delay(ms:number,signal:AbortSignal):Promise<void>{if(signal.aborted)return;await new Promise<void>(resolve=>{const timer=setTimeout(done,ms);function done(){clearTimeout(timer);signal.removeEventListener('abort',done);resolve();}signal.addEventListener('abort',done,{once:true});});}
export async function runMemberLocalConnector(options:MemberConnectorOptions):Promise<void>{
  const core=exactMemberCoreOrigin(options.coreOrigin);const fetcher=options.fetch??fetch;
  if(!/^[A-Za-z0-9_-]{16,256}$/u.test(options.pairingCode))throw new MemberOcrError('pairing_failed');
  const capabilities=parseOcrEngineCapabilities(await options.engine.capabilities());
  let token:string|undefined;let expires=0;
  // A stopped or uncertain attempt must not be inferred again by idle polling.
  // Explicit resume creates a new server attempt; re-pair uses a new device.
  const attemptedBooks=new Map<string,string>();
  async function request(path:string,body:unknown|undefined,signal:AbortSignal):Promise<unknown>{
    const encoded=body===undefined?undefined:JSON.stringify(body);
    const started=performance.now();
    try{
      const response=await fetcher(core+LOCAL_OCR_ROOT+path,{method:body===undefined?'GET':'POST',redirect:'error',
        headers:{Origin:core,...(body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:`Bearer ${token}`}:{})},
        ...(encoded===undefined?{}:{body:encoded}),signal:AbortSignal.any([signal,AbortSignal.timeout(10_000)])});
      const headersAt=performance.now();
      if(response.status===401||response.status===403){await response.body?.cancel();throw new MemberOcrError(token?'access_revoked':'pairing_failed');}
      if(!response.ok){await response.body?.cancel();throw new MemberOcrError('protocol_invalid');}
      const parsed=await jsonResponse(response);
      // Fixed endpoint labels and numeric durations/sizes only: no URL, token,
      // task identity, image, OCR text or response body reaches diagnostics.
      const operation=path.slice('/device/'.length);
      if(['book-claim','book-source','book-heartbeat','book-page','book-finish'].includes(operation)&&path===`/device/${operation}`){
        const finished=performance.now();
        try{options.onEvent?.({event:'member_ocr.book_request_timing',operation:operation as NonNullable<MemberBookEvent['operation']>,
          milliseconds:Math.round(finished-started),headersMilliseconds:Math.round(headersAt-started),bodyMilliseconds:Math.round(finished-headersAt),
          requestBytes:encoded===undefined?0:Buffer.byteLength(encoded),responseBytes:parsed.sizeBytes});}catch{/* Diagnostics do not change acknowledgement authority. */}
      }
      return parsed.value;
    }catch(error){if(error instanceof MemberOcrError)throw error;throw new MemberOcrError(signal.aborted?'aborted':'network_failed');}
  }
  try{
    const waitMs=options.engineWaitMs??0;
    if(!Number.isSafeInteger(waitMs)||waitMs<0||waitMs>120_000)throw new MemberOcrError('configuration_invalid');
    const waitUntil=performance.now()+waitMs;
    let lease=await options.resourceGuard.acquire(options.signal);
    while(!lease&&performance.now()<waitUntil&&!options.signal.aborted){
      options.onEvent?.({event:'member_ocr.busy'});
      await delay(Math.min(options.pollDelayMs??2000,Math.max(0,waitUntil-performance.now())),options.signal);
      if(options.signal.aborted||performance.now()>=waitUntil)break;
      lease=await options.resourceGuard.acquire(options.signal);
    }
    if(options.signal.aborted){await lease?.release();throw new MemberOcrError('aborted');}
    if(waitMs>0&&performance.now()>=waitUntil){await lease?.release();throw new MemberOcrError('engine_busy');}
    if(!lease)throw new MemberOcrError('engine_busy');
    let probe:OcrEnginePageResult;
    try{probe=await options.engine.recognize({requestId:LOCAL_OCR_PROBE_REQUEST_ID,image:syntheticOcrProbe(),mimeType:'image/png',languageHints:['en']},
      {signal:AbortSignal.any([options.signal,lease.signal,AbortSignal.timeout(90_000)])});}
    finally{await lease.release();}
    if(probe.status!=='recognized'||probe.truncated||probe.text?.replace(/\s+/gu,' ').trim()!==LOCAL_OCR_PROBE_TEXT)throw new MemberOcrError('engine_failed');
    parseOcrEnginePageResult(probe,{requestId:LOCAL_OCR_PROBE_REQUEST_ID,capabilities});
    const connected=object(await request('/connect',{pairingCode:options.pairingCode,capabilities,probeResult:probe,
      ...(options.bookSessionFactory?{transportFeatures:[LOCAL_OCR_BOOK_FEATURE]}:{})},options.signal)) as unknown as LocalOcrConnection;
    if(typeof connected.deviceToken!=='string'||!/^[A-Za-z0-9_-]{32,512}$/u.test(connected.deviceToken))throw new MemberOcrError('protocol_invalid');
    expires=expiry(connected.tokenExpiresAt,LOCAL_OCR_LIMITS.tokenLifetimeMs);token=connected.deviceToken;
    options.onEvent?.({event:'member_ocr.connected'});
    while(!options.signal.aborted&&Date.now()<expires){
      const lease=await options.resourceGuard.acquire(options.signal);
      if(!lease){options.onEvent?.({event:'member_ocr.busy'});await delay(options.pollDelayMs??2000,options.signal);continue;}
      const controller=new AbortController();const idleSignal=AbortSignal.any([options.signal,lease.signal,controller.signal]);
      let job:LocalOcrDeviceJob|undefined;
      let waitBeforePoll=false;
      let leaseReleased=false;
      try{
        const claimed=object(await request('/device/claim',undefined,idleSignal));
        if(claimed.job===null){
          if(options.bookSessionFactory){
            const value=object(await request('/device/book-claim',undefined,idleSignal));
            if(value.job!==null){
              const book=parseMemberBookClaim(value.job,capabilities);
              if(attemptedBooks.get(book.job.id)===book.attemptId){waitBeforePoll=true;continue;}
              attemptedBooks.set(book.job.id,book.attemptId);
              // The book owns later bounded slices; never nest a second guard
              // acquisition inside this empty legacy-poll lease.
              await lease.release();leaseReleased=true;
              await runMemberBookJob(book,{request,resourceGuard:options.resourceGuard,sessionFactory:options.bookSessionFactory,
                signal:AbortSignal.any([options.signal,AbortSignal.timeout(Math.max(1,Math.min(expires,Date.parse(book.job.expiresAt))-Date.now()))]),capabilities,
                ...(options.fetch?{fetch:options.fetch}:{}),...(options.onEvent?{onEvent:options.onEvent}:{}),
                ...(options.bookPdfFactory?{pdfFactory:options.bookPdfFactory}:{}),...(options.heartbeatMs?{heartbeatMs:options.heartbeatMs}:{})});
            }
          }
          waitBeforePoll=true;continue;
        }
        job=parseMemberDeviceJob(claimed.job,capabilities);
        const deadline=AbortSignal.timeout(Math.max(1,Math.min(90_000,Date.parse(job.leaseExpiresAt)-Date.now(),expires-Date.now())));
        const signal=AbortSignal.any([idleSignal,deadline]);
        let heartbeatError:unknown;
        let finished=false;
        const heartbeat=(async()=>{
          while(!signal.aborted){await delay(options.heartbeatMs??2000,signal);if(signal.aborted)return;
            try{const state=object(await request('/device/heartbeat',{jobId:job!.id,attemptId:job!.attemptId},signal));if(state.active!==true)throw new MemberOcrError('access_revoked');}
            catch(error){if(!finished){heartbeatError=error;controller.abort();}return;}}
        })();
        let result:OcrEnginePageResult|undefined;let errorCode:'engine_failed'|'invalid_result'|undefined;
        try{const returned=await options.engine.recognize({requestId:job.id,image:Buffer.from(job.imageBase64,'base64'),mimeType:'image/png',languageHints:[]},{signal});
          try{result=parseOcrEnginePageResult(returned,{requestId:job.id,capabilities});}catch{throw new MemberOcrError('invalid_result');}
        }catch(error){result=undefined;errorCode=error instanceof MemberOcrError&&error.code==='invalid_result'?'invalid_result':'engine_failed';}
        finally{finished=true;controller.abort();await heartbeat;}
        if(heartbeatError)throw heartbeatError;
        if(options.signal.aborted||lease.signal.aborted||deadline.aborted)continue;
        const active=object(await request('/device/heartbeat',{jobId:job.id,attemptId:job.attemptId},options.signal));
        if(active.active!==true)throw new MemberOcrError('access_revoked');
        const accepted=object(await request('/device/complete',{jobId:job.id,attemptId:job.attemptId,...(result?{result}:{errorCode})},options.signal));
        if(accepted.accepted!==true)throw new MemberOcrError('protocol_invalid');
        options.onEvent?.({event:result?'member_ocr.completed':'member_ocr.failed',...(errorCode?{code:errorCode}:{})});
      }catch(error){
        if(options.signal.aborted)return;
        if(error instanceof MemberOcrError&&error.code==='access_revoked')throw error;
        options.onEvent?.({event:'member_ocr.request_failed',code:error instanceof MemberOcrError?error.code:'engine_failed'});
        waitBeforePoll=true;
      }finally{controller.abort();if(!leaseReleased)await lease.release();if(waitBeforePoll)await delay(options.pollDelayMs??2000,options.signal);}
    }
  }finally{token=undefined;await options.engine.close();}
}
