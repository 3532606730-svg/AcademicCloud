import { createHash } from "node:crypto";
import { readFile, realpath, mkdir, access } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { LOCAL_OCR_LIMITS, OCR_ENGINE_MAX_TEXT_UNITS, parseOcrEnginePageRequest, parseOcrEnginePageResult,
  type OcrEngineAdapter, type OcrEngineCapabilities, type OcrEnginePageRequest, type OcrEnginePageResult } from "@academiccloud/compute-contracts";
import { PADDLE_DETECTION_MODEL, PADDLE_RECOGNITION_MODEL } from "./bibliographic-intelligence.js";
import { PaddleOcrSidecarAdapter, PADDLE_OCR_ENGINE_ID, type PaddleOcrConfig } from "./paddle-ocr.js";
import { prepareOcrGeometry } from "./ocr-geometry.js";
import { inspectRenderedPng } from "./rendered-png.js";
import { parseNativeResourceConfig, type NativeResourceConfig } from "./native-resource.js";
import type { OcrAdapter } from "./ocr.js";

export class MemberOcrError extends Error {
  constructor(readonly code: "configuration_invalid" | "engine_unavailable" | "input_invalid" | "invalid_result" | "engine_busy" | "aborted" | "timeout" | "engine_failed" | "protocol_invalid" | "network_failed" | "access_revoked" | "pairing_failed") {super(code);}
}
export interface MemberPaddleConfig extends Omit<PaddleOcrConfig,"engineId"|"executableArguments"> { nativeResource: NativeResourceConfig }
export const MEMBER_PADDLE_CAPABILITIES: OcrEngineCapabilities={
  engineId:"paddle_ppocrv6_small_local",engineVersion:"paddleocr3.7.0-paddle3.3.1",
  modelVersion:`det-${PADDLE_DETECTION_MODEL.revision}-rec-${PADDLE_RECOGNITION_MODEL.revision}`,
  inputMimeTypes:["image/png"],scriptHints:["Hans","Latn"],maxImageBytes:LOCAL_OCR_LIMITS.maxImageBytes,canReturnGeometry:true,
};
function path(value:unknown):string {if(typeof value!=="string"||!isAbsolute(value)||value.length>1024||/[\x00\r\n]/u.test(value))throw new MemberOcrError("configuration_invalid");return value;}
export function parseMemberPaddleConfig(value:unknown):MemberPaddleConfig {
  if(typeof value!=="object"||value===null||Array.isArray(value))throw new MemberOcrError("configuration_invalid");
  const v=value as Record<string,unknown>;
  if(Object.keys(v).length!==7||Object.keys(v).some(k=>!["pythonPath","sidecarPath","detectionModelPath","recognitionModelPath","cachePath","device","nativeResource"].includes(k))
    ||!['cpu','gpu'].includes(v.device as string))throw new MemberOcrError("configuration_invalid");
  return {pythonPath:path(v.pythonPath),sidecarPath:path(v.sidecarPath),detectionModelPath:path(v.detectionModelPath),
    recognitionModelPath:path(v.recognitionModelPath),cachePath:path(v.cachePath),device:v.device as "cpu"|"gpu",nativeResource:parseNativeResourceConfig(v.nativeResource)};
}
export async function loadMemberPaddleConfig(configPath:string):Promise<MemberPaddleConfig> {
  try {const bytes=await readFile(path(configPath));if(bytes.length>8192)throw new Error();return parseMemberPaddleConfig(JSON.parse(bytes.toString('utf8')));}
  catch {throw new MemberOcrError("configuration_invalid");}
}
export async function detectInstalledPaddle():Promise<MemberPaddleConfig> {
  try {
    const release=await realpath('/srv/academiccloud-compute/current');
    const paddle=join(release,'runtime/paddle');
    const config=parseMemberPaddleConfig({pythonPath:join(paddle,'venv/bin/python'),sidecarPath:fileURLToPath(new URL('../scripts/paddle_ocr_sidecar.py',import.meta.url)),
      detectionModelPath:join(paddle,'models/PP-OCRv6_small_det'),recognitionModelPath:join(paddle,'models/PP-OCRv6_small_rec'),
      cachePath:join(homedir(),'.cache/academiccloud-member-ocr'),device:'gpu',nativeResource:{pythonPath:'/usr/bin/python3',
        lockPath:'/srv/academiccloud-compute/coordination/native-resource.lock',sharedHost:true,selectors:{localPull:'/srv/academiccloud-compute/current',catalogBridge:'/srv/academiccloud-compute/catalog-current'}}});
    await verifyMemberPaddleAssets(config);return config;
  } catch {throw new MemberOcrError('engine_unavailable');}
}
export async function verifyMemberPaddleAssets(config:MemberPaddleConfig):Promise<void> {
  try {
    // A standard shared Owner installation cannot opt out by selecting a custom JSON profile.
    if(process.platform==='linux') {
      let shared=false;try{await access('/srv/academiccloud-compute/current');shared=true;}catch{/* isolated member */}
      if(shared&&!config.nativeResource.sharedHost)throw new Error();
    }
    await access(config.pythonPath);
    for(const [root,pin] of [[config.detectionModelPath,PADDLE_DETECTION_MODEL],[config.recognitionModelPath,PADDLE_RECOGNITION_MODEL]] as const) {
      const bytes=await readFile(join(root,'inference.pdiparams'));if(createHash('sha256').update(bytes).digest('hex')!==pin.sha256)throw new Error();
    }
    const expected='eb121d2509667b1e77be81dfea089ac4e00800107cbe0f552e1498632dd451e8';
    if(createHash('sha256').update(await readFile(config.sidecarPath)).digest('hex')!==expected)throw new Error();
    await mkdir(config.cachePath,{recursive:true,mode:0o700});
  }catch{throw new MemberOcrError('engine_unavailable');}
}
export class MemberPaddleAdapter implements OcrEngineAdapter {
  #active=false;#closed=false;#abort:AbortController|undefined;#operation:Promise<OcrEnginePageResult>|undefined;
  constructor(private readonly config:MemberPaddleConfig,private readonly factory:(config:PaddleOcrConfig)=>OcrAdapter=c=>new PaddleOcrSidecarAdapter(c)){}
  async capabilities():Promise<OcrEngineCapabilities>{return structuredClone(MEMBER_PADDLE_CAPABILITIES);}
  async recognize(request:OcrEnginePageRequest,options:{signal:AbortSignal}):Promise<OcrEnginePageResult>{
    if(this.#closed)throw new MemberOcrError('engine_unavailable');if(this.#active)throw new MemberOcrError('engine_busy');
    if(options.signal.aborted)throw new MemberOcrError('aborted');
    let input:OcrEnginePageRequest;let dimensions:{width:number;height:number};
    try{input=parseOcrEnginePageRequest(request,MEMBER_PADDLE_CAPABILITIES);dimensions=inspectRenderedPng(input.image);}catch{throw new MemberOcrError('input_invalid');}
    this.#active=true;const abort=new AbortController();this.#abort=abort;
    const deadline=AbortSignal.timeout(90_000);const signal=AbortSignal.any([options.signal,abort.signal,deadline]);
    let adapter:OcrAdapter;
    try{adapter=this.factory({...this.config,engineId:PADDLE_OCR_ENGINE_ID,
      executableArguments:['-I',fileURLToPath(new URL('../scripts/member_paddle_offline.py',import.meta.url))]});}
    catch{this.#active=false;this.#abort=undefined;throw new MemberOcrError('engine_unavailable');}
    const operation=(async()=>{
      try{
        const response=await adapter.recognizePage({imageBytes:input.image,pageIndex:1,readerMode:true,includeGeometry:true},signal);
        if(signal.aborted)throw new MemberOcrError(deadline.aborted?'timeout':'aborted');
        const prepared=prepareOcrGeometry(response.text,response.geometry,OCR_ENGINE_MAX_TEXT_UNITS,dimensions);
        const text=prepared.text||null;
        try{return parseOcrEnginePageResult({requestId:input.requestId,status:response.status,text,
          truncated:text===null?false:response.truncated===true||prepared.truncated,confidence:response.confidence,
          provenance:{engineId:MEMBER_PADDLE_CAPABILITIES.engineId,engineVersion:MEMBER_PADDLE_CAPABILITIES.engineVersion,modelVersion:MEMBER_PADDLE_CAPABILITIES.modelVersion},
          ...((prepared.geometry.status==='available'||prepared.geometry.status==='limited')?{lineBoxes:prepared.geometry.lineBoxes}:{}),
        },{requestId:input.requestId,capabilities:MEMBER_PADDLE_CAPABILITIES});}catch{throw new MemberOcrError('invalid_result');}
      }catch(error){if(error instanceof MemberOcrError)throw error;throw new MemberOcrError(signal.aborted?(deadline.aborted?'timeout':'aborted'):'engine_failed');}
      finally{await adapter.close?.();this.#active=false;this.#abort=undefined;}
    })();this.#operation=operation;
    try{return await operation;}finally{this.#operation=undefined;}
  }
  async close():Promise<void>{this.#closed=true;this.#abort?.abort();try{await this.#operation;}catch{/* controlled operation already rejected */}}
}
