import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm,mkdir,writeFile,copyFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNativeResourceGuard,verifyNativeCooperation} from '../dist/native-resource.js';
const directory=await mkdtemp(join(tmpdir(),'academiccloud-native-lock-'));
const config={pythonPath:'/usr/bin/python3',lockPath:join(directory,'native.lock')};
process.once('exit',()=>{});
test('real fcntl is mutually exclusive and explicit cleanup releases',async()=>{
  const first=createNativeResourceGuard(config);const second=createNativeResourceGuard(config);
  const lease=await first.acquire();assert.ok(lease);assert.equal(await second.acquire(),null);
  await lease.release();const next=await second.acquire();assert.ok(next);await next.release();
});
test('caller abort keeps lock until native cleanup explicitly releases it',async()=>{
  const c=new AbortController();const lease=await createNativeResourceGuard(config).acquire(c.signal);assert.ok(lease);
  c.abort('private');assert.equal(lease.signal.aborted,true);assert.equal(await createNativeResourceGuard(config).acquire(),null);
  await lease.release();await lease.release();const next=await createNativeResourceGuard(config).acquire();assert.ok(next);await next.release();
});
test('pre-abort never acquires and unknown shared runtime contract fails closed',async()=>{
  const c=new AbortController();c.abort();await assert.rejects(createNativeResourceGuard(config).acquire(c.signal),{message:'aborted'});
  await assert.rejects(verifyNativeCooperation({...config,sharedHost:true,selectors:{localPull:directory,catalogBridge:directory}}),{message:'cooperation_missing'});
});
test('helper spawn failure is safe and does not own resource',async()=>{
  await assert.rejects(createNativeResourceGuard({...config,pythonPath:'/not-existing'}).acquire(),{message:'unavailable'});
  const next=await createNativeResourceGuard(config).acquire();assert.ok(next);await next.release();
});
test('dead owner leaves a fail-closed marker after its real OS lock is released',async()=>{
  const moduleUrl=new URL('../dist/native-resource.js',import.meta.url).href;
  const child=spawn(process.execPath,['--input-type=module','-e',`import {createNativeResourceGuard} from ${JSON.stringify(moduleUrl)}; await createNativeResourceGuard(${JSON.stringify(config)}).acquire(); console.log('ready'); setInterval(()=>{},1000);`],{stdio:['ignore','pipe','pipe']});
  await once(child.stdout,'data');assert.equal(await createNativeResourceGuard(config).acquire(),null);child.kill('SIGKILL');await once(child,'exit');
  let blocked=false;for(let i=0;i<30&&!blocked;i++){await new Promise(r=>setTimeout(r,10));
    try{const next=await createNativeResourceGuard(config).acquire();assert.equal(next,null);}
    catch(error){assert.equal(error.code,'unavailable');blocked=true;}}
  assert.equal(blocked,true);assert.equal(await readFile(config.lockPath,'utf8'),'owned\n');
  // Synthetic-only maintenance after all test children have exited; preserve inode.
  await writeFile(config.lockPath,'closed\n');
  const next=await createNativeResourceGuard(config).acquire();assert.ok(next);await next.release();
});

test('helper ignores group shutdown signals until parent confirms native cleanup',async()=>{
  const helper=fileURLToPath(new URL('../scripts/native_resource_lease.py',import.meta.url));
  const child=spawn('/usr/bin/python3',['-I',helper,config.lockPath],{stdio:['pipe','pipe','pipe']});
  await once(child.stdout,'data');child.kill('SIGTERM');child.kill('SIGINT');
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(child.exitCode,null);assert.equal(child.signalCode,null);
  assert.equal(await createNativeResourceGuard(config).acquire(),null);
  const exited=once(child,'exit');child.stdin.end('release\n');await exited;
  const next=await createNativeResourceGuard(config).acquire();assert.ok(next);await next.release();
});

test('unexpected helper death cannot allow overlap with still-running native cleanup',async()=>{
  const lease=await createNativeResourceGuard(config).acquire();assert.ok(lease);
  const children=(await readFile(`/proc/${process.pid}/task/${process.pid}/children`,'utf8')).trim().split(/\s+/).map(Number).filter(Boolean);
  const matches=[];for(const pid of children){const argv=await readFile(`/proc/${pid}/cmdline`,'utf8');if(argv.includes('native_resource_lease.py')&&argv.includes(config.lockPath))matches.push(pid);}
  assert.equal(matches.length,1);
  const lost=new Promise(resolve=>lease.signal.addEventListener('abort',resolve,{once:true}));
  process.kill(matches[0],'SIGKILL');await lost;
  await assert.rejects(createNativeResourceGuard(config).acquire(),{message:'unavailable'});
  let timer;try{await Promise.race([lease.release(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('dead helper release hung')),1000);})]);}finally{clearTimeout(timer);}
  assert.equal(await readFile(config.lockPath,'utf8'),'owned\n');
  await writeFile(config.lockPath,'closed\n'); // Synthetic fixture is fully closed.
});
test('exact selector contract plus live registration required for both real service processes',async()=>{
  const root=join(directory,'release');await mkdir(join(root,'compute/dist'),{recursive:true});
  await writeFile(join(root,'package.json'),'"unused"'.replace('"unused"','{"type":"module"}'));
  await copyFile(fileURLToPath(new URL('../dist/native-resource.js',import.meta.url)),join(root,'compute/dist/native-resource.js'));
  await writeFile(join(root,'native-resource-cooperation.json'),JSON.stringify({protocol:'academiccloud.native-resource.v1'}),{mode:0o600});
  const cfg=join(directory,'service.json');await writeFile(cfg,JSON.stringify(config),{mode:0o600});
  const services=[];
  try{
    for(const [role,name]of [['localPull','local-pull-main.js'],['catalogBridge','catalog-bridge.js']]){
      const entry=join(root,'compute/dist',name);
      await writeFile(entry,`import {registerNativeCooperation} from './native-resource.js';await registerNativeCooperation('${role}',{ACADEMICCLOUD_NATIVE_RESOURCE_GUARD_CONFIG:${JSON.stringify(cfg)}});console.log('ready');setInterval(()=>{},1000);`);
      const child=spawn(process.execPath,[entry],{stdio:['ignore','pipe','pipe']});services.push(child);await once(child.stdout,'data');
    }
    const shared={...config,sharedHost:true,selectors:{localPull:root,catalogBridge:root}};
    await verifyNativeCooperation(shared);
    services[0].kill('SIGKILL');await once(services[0],'exit');await assert.rejects(verifyNativeCooperation(shared),{message:'cooperation_missing'});
  }finally{for(const child of services){if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await once(child,'exit');}}}
});
test('cleanup isolated test directory',async()=>{await rm(directory,{recursive:true,force:true});});
