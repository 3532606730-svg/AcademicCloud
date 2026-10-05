import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath, stat, writeFile, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

export const NATIVE_RESOURCE_PROTOCOL = "academiccloud.native-resource.v1";
export class NativeResourceError extends Error {
  constructor(readonly code: "busy" | "unavailable" | "cooperation_missing" | "aborted") { super(code); }
}
export interface NativeResourceConfig {
  pythonPath: string;
  lockPath: string;
  sharedHost?: boolean;
  selectors?: { localPull: string; catalogBridge: string };
}
export interface NativeResourceLease { signal: AbortSignal; release(): Promise<void> }
export interface NativeResourceGuard { acquire(signal?: AbortSignal): Promise<NativeResourceLease | null> }
const HELPER = fileURLToPath(new URL("../scripts/native_resource_lease.py", import.meta.url));
const RELEASE = fileURLToPath(new URL("../../", import.meta.url));
function localPath(value: unknown): string {
  if (typeof value !== "string" || !isAbsolute(value) || value.length > 1024 || /[\x00\r\n]/u.test(value)) throw new NativeResourceError("unavailable");
  return value;
}
export function parseNativeResourceConfig(value: unknown): NativeResourceConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new NativeResourceError("unavailable");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !["pythonPath", "lockPath", "sharedHost", "selectors"].includes(k))
    || (v.sharedHost !== undefined && typeof v.sharedHost !== "boolean")) throw new NativeResourceError("unavailable");
  let selectors: NativeResourceConfig["selectors"];
  if (v.selectors !== undefined) {
    if (typeof v.selectors !== "object" || v.selectors === null || Array.isArray(v.selectors)) throw new NativeResourceError("unavailable");
    const s=v.selectors as Record<string,unknown>;
    if (Object.keys(s).length !== 2) throw new NativeResourceError("unavailable");
    selectors={localPull:localPath(s.localPull),catalogBridge:localPath(s.catalogBridge)};
  }
  if (v.sharedHost && !selectors) throw new NativeResourceError("cooperation_missing");
  return {pythonPath:localPath(v.pythonPath),lockPath:localPath(v.lockPath),
    ...(v.sharedHost === undefined ? {} : {sharedHost:v.sharedHost}),...(selectors ? {selectors} : {})};
}
async function json(path: string): Promise<Record<string,unknown>> {
  const info=await stat(path);
  if (!info.isFile() || info.size > 8192 || (info.mode & 0o022)) throw new NativeResourceError("cooperation_missing");
  const value: unknown=JSON.parse(await readFile(path,"utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new NativeResourceError("cooperation_missing");
  return value as Record<string,unknown>;
}
async function startToken(pid: number): Promise<string> {
  const value=await readFile(`/proc/${pid}/stat`,"utf8");
  return value.slice(value.lastIndexOf(")")+2).split(" ")[19]!;
}
export async function verifyNativeCooperation(config: NativeResourceConfig): Promise<void> {
  if (!config.sharedHost) return;
  if (!config.selectors || process.platform !== "linux") throw new NativeResourceError("cooperation_missing");
  try {
    for (const [role, selector] of Object.entries(config.selectors)) {
      const root=await realpath(selector);
      const contract=await json(join(root,"native-resource-cooperation.json"));
      if (contract.protocol !== NATIVE_RESOURCE_PROTOCOL) throw new NativeResourceError("cooperation_missing");
      const record=await json(`${config.lockPath}.${role}.json`);
      const pid=record.pid;
      if (record.protocol !== NATIVE_RESOURCE_PROTOCOL || record.lockPath !== config.lockPath || record.releaseRoot !== root
        || typeof pid !== "number" || !Number.isSafeInteger(pid) || pid < 1 || record.startToken !== await startToken(pid)) throw new NativeResourceError("cooperation_missing");
      const argv=(await readFile(`/proc/${pid}/cmdline`,"utf8")).split("\0");
      const entry=role === "localPull" ? "local-pull-main.js" : "catalog-bridge.js";
      if (!argv.some(arg => arg.endsWith(`/compute/dist/${entry}`) && arg.startsWith(root+"/"))) {
        // Services normally start through a selector; resolve the entry before comparison.
        const script=argv.find(arg => arg.endsWith(`/compute/dist/${entry}`));
        if (!script || await realpath(script) !== join(root,"compute/dist",entry)) throw new NativeResourceError("cooperation_missing");
      }
      const digest=createHash("sha256").update(await readFile(join(root,"native-resource-cooperation.json"))).digest("hex");
      if (record.contractSha256 !== digest) throw new NativeResourceError("cooperation_missing");
    }
  } catch { throw new NativeResourceError("cooperation_missing"); }
}
export function createNativeResourceGuard(config: NativeResourceConfig): NativeResourceGuard {
  return { async acquire(signal) {
    if (signal?.aborted) throw new NativeResourceError("aborted");
    await verifyNativeCooperation(config);
    if (process.platform !== "linux") throw new NativeResourceError("unavailable");
    return new Promise((resolve,reject) => {
      const child=spawn(config.pythonPath,["-I",HELPER,config.lockPath],{stdio:["pipe","pipe","ignore"],shell:false,windowsHide:true});
      const lost=new AbortController();let settled=false;let releasing=false;let buffer="";
      const fail=()=>{clearTimeout(timer);lost.abort();if(!settled){settled=true;reject(new NativeResourceError("unavailable"));}};
      const timer=setTimeout(()=>{child.kill("SIGKILL");fail();},5000);
      const abort=()=>{if(!settled){child.stdin.end();child.kill("SIGKILL");fail();}else lost.abort();};
      signal?.addEventListener("abort",abort,{once:true});
      child.on("error",fail);
      child.on("exit",()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);if(!releasing)fail();});
      child.stdout.on("data",(chunk:Buffer)=>{
        buffer+=chunk.toString("utf8");
        if(buffer.length>128){child.kill("SIGKILL");fail();return;}
        if(!buffer.includes("\n")||settled)return;
        clearTimeout(timer);
        if(buffer.trim()==='{"status":"busy"}') {settled=true;releasing=true;signal?.removeEventListener("abort",abort);resolve(null);return;}
        if(buffer.trim()!=='{"status":"acquired"}') {child.kill("SIGKILL");fail();return;}
        settled=true;
        resolve({signal:lost.signal,async release(){
          if(releasing)return;releasing=true;
          signal?.removeEventListener("abort",abort);
          await new Promise<void>(done=>{if(child.exitCode!==null||child.signalCode!==null){done();return;}child.once("exit",()=>done());child.stdin.end('release\n');});
        }});
      });
    });
  }};
}
export async function loadNativeResourceGuard(environment: NodeJS.ProcessEnv = process.env): Promise<NativeResourceGuard | undefined> {
  const path=environment.ACADEMICCLOUD_NATIVE_RESOURCE_GUARD_CONFIG;
  if (!path) return undefined;
  return createNativeResourceGuard(parseNativeResourceConfig(await json(localPath(path))));
}
/** Running-service registration binds its actual guard configuration to an exact release. */
export async function registerNativeCooperation(role: "localPull" | "catalogBridge", environment: NodeJS.ProcessEnv = process.env): Promise<()=>Promise<void>> {
  const path=environment.ACADEMICCLOUD_NATIVE_RESOURCE_GUARD_CONFIG;
  if(!path)return async()=>{};
  const config=parseNativeResourceConfig(await json(localPath(path)));
  const root=await realpath(RELEASE);
  const contract=await json(join(root,"native-resource-cooperation.json"));
  if(contract.protocol!==NATIVE_RESOURCE_PROTOCOL)throw new NativeResourceError("cooperation_missing");
  const target=`${config.lockPath}.${role}.json`;const temporary=`${target}.${process.pid}.tmp`;
  await writeFile(temporary,JSON.stringify({protocol:NATIVE_RESOURCE_PROTOCOL,pid:process.pid,startToken:await startToken(process.pid),
    releaseRoot:root,lockPath:config.lockPath,contractSha256:createHash("sha256").update(await readFile(join(root,"native-resource-cooperation.json"))).digest("hex")}),{mode:0o600,flag:"wx"});
  await rename(temporary,target);
  return async()=>{try{const current=await json(target);if(current.pid===process.pid)await unlink(target);}catch{/* no private diagnostics */}};
}
