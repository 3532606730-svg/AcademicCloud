import { stdin, stderr, stdout } from "node:process";
import { createNativeResourceGuard } from "./native-resource.js";
import { detectInstalledPaddle, loadMemberPaddleConfig, MemberOcrError, MemberPaddleAdapter, verifyMemberPaddleAssets } from "./member-paddle.js";
import { exactMemberCoreOrigin, runMemberLocalConnector } from "./member-local-ocr.js";

export function parseMemberOcrFlags(args:readonly string[]):{core:string;config?:string;detectInstalled:boolean}{
  let core:string|undefined,config:string|undefined,detectInstalled=false,pair=false;
  for(let i=0;i<args.length;i++){
    const flag=args[i];
    if(flag==='--core'&&!core)core=args[++i];else if(flag==='--config'&&!config)config=args[++i];
    else if(flag==='--detect-installed'&&!detectInstalled)detectInstalled=true;else if(flag==='--pair'&&!pair)pair=true;else throw new MemberOcrError('configuration_invalid');
  }
  if(!core||!pair||Boolean(config)===detectInstalled)throw new MemberOcrError('configuration_invalid');
  return {core:exactMemberCoreOrigin(core),...(config?{config}:{}),detectInstalled};
}
export async function readPairingCode(signal?:AbortSignal):Promise<string>{
  stderr.write('粘贴连接码并按 Enter（不显示输入）：');
  const raw=stdin.isTTY&&typeof stdin.setRawMode==='function';if(raw)stdin.setRawMode(true);
  try{return await new Promise<string>((resolve,reject)=>{
    let value='';const timeout=setTimeout(()=>done(new MemberOcrError('pairing_failed')),10*60_000);
    function cleanup(){clearTimeout(timeout);stdin.off('data',data);stdin.off('end',end);signal?.removeEventListener('abort',abort);stdin.pause();}
    function done(error?:Error){cleanup();if(error)reject(error);else resolve(value);}
    function end(){done(new MemberOcrError('pairing_failed'));}
    function abort(){done(new MemberOcrError('aborted'));}
    function data(chunk:Buffer){for(const char of chunk.toString('utf8')){if(char==='\x03'){done(new MemberOcrError('aborted'));return;}if(char==='\r'||char==='\n'){done();return;}if(char==='\b'||char==='\x7f')value=value.slice(0,-1);else{value+=char;if(value.length>256){done(new MemberOcrError('pairing_failed'));return;}}}}
    stdin.on('data',data);stdin.once('end',end);signal?.addEventListener('abort',abort,{once:true});stdin.resume();if(signal?.aborted)abort();
  });}finally{if(raw)stdin.setRawMode(false);stderr.write('\n');}
}
async function main():Promise<void>{
  const flags=parseMemberOcrFlags(process.argv.slice(2));
  const config=flags.detectInstalled?await detectInstalledPaddle():await loadMemberPaddleConfig(flags.config!);
  await verifyMemberPaddleAssets(config);
  const guard=createNativeResourceGuard(config.nativeResource);
  // Verify cooperation before accepting a human pairing code or loading an engine.
  const preflight=await guard.acquire();if(!preflight)throw new MemberOcrError('engine_busy');await preflight.release();
  const controller=new AbortController();for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>controller.abort());
  const pairingCode=await readPairingCode(controller.signal);
  await runMemberLocalConnector({coreOrigin:flags.core,pairingCode,engine:new MemberPaddleAdapter(config),resourceGuard:guard,signal:controller.signal,
    onEvent:event=>stdout.write(JSON.stringify(event)+'\n')});
}
if(process.argv[1]&&/(?:^|[\\/])member-ocr-main\.(?:js|ts)$/u.test(process.argv[1])){
  main().catch(error=>{stderr.write(JSON.stringify({event:'member_ocr.stopped',code:error instanceof MemberOcrError?error.code:'engine_unavailable'})+'\n');process.exitCode=1;});
}
