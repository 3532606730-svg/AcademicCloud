import { build, version } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=resolve(root,'output/vnext/member-local-ocr-connector');
const kit=join(out,'kit');
if(version!=='0.28.2')throw Error('Expected installed locked esbuild 0.28.2');
await mkdir(join(kit,'compute/dist'),{recursive:true});await mkdir(join(kit,'compute/scripts'),{recursive:true});
await build({entryPoints:[join(root,'compute/src/member-ocr-main.ts')],outfile:join(kit,'compute/dist/member-ocr-main.js'),
  bundle:true,platform:'node',target:'node24',format:'esm',external:['@napi-rs/canvas','pdfjs-dist/*'],
  banner:{js:"import { createRequire as __kitCreateRequire } from 'node:module'; const require = __kitCreateRequire(import.meta.url);"},logLevel:'silent'});
await build({entryPoints:[join(root,'compute/src/member-book-pdf-worker.ts')],outfile:join(kit,'compute/dist/member-book-pdf-worker.js'),
  bundle:true,platform:'node',target:'node24',format:'esm',external:['@napi-rs/canvas','pdfjs-dist/*'],
  banner:{js:"import { createRequire as __kitCreateRequire } from 'node:module'; const require = __kitCreateRequire(import.meta.url);"},logLevel:'silent'});
await build({entryPoints:[join(root,'compute/src/member-host-memory.ts')],outfile:join(kit,'compute/dist/member-host-memory.js'),
  bundle:true,platform:'node',target:'node24',format:'esm',logLevel:'silent'});
for(const name of ['paddle_ocr_sidecar.py','native_resource_lease.py','member_paddle_offline.py'])await copyFile(join(root,'compute/scripts',name),join(kit,'compute/scripts',name));
await writeFile(join(kit,'package.json'),JSON.stringify({name:'academiccloud-member-local-ocr-connector',private:true,version:'0.2.0',type:'module',
  engines:{node:'>=24 <25'},scripts:{start:'node compute/dist/member-ocr-main.js'},dependencies:{'@napi-rs/canvas':'1.0.7','pdfjs-dist':'6.2.108'}},null,2));
await writeFile(join(kit,'config.example.json'),JSON.stringify({pythonPath:'/absolute/paddle/venv/bin/python',sidecarPath:'/absolute/connector/compute/scripts/paddle_ocr_sidecar.py',
  detectionModelPath:'/absolute/PP-OCRv6_small_det',recognitionModelPath:'/absolute/PP-OCRv6_small_rec',cachePath:'/absolute/private-cache',device:'gpu',
  nativeResource:{pythonPath:'/usr/bin/python3',lockPath:'/absolute/private-cache/native-resource.lock',sharedHost:false}},null,2));
await writeFile(join(kit,'README.md'),`# AcademicCloud 本机 OCR 连接器

此包处理自己账户明确提交的当前页和私人整书任务。它不包含模型、账户令牌、Catalog 凭据或任何书页。每次启动重新配对，令牌仅存在本次进程内存。

## 已有 Owner 标准 WSL 引擎

1. 安装 Node.js24（官方页面：https://nodejs.org/en/download），解压本包。
2. 进入解压目录，运行 npm install。只安装固定版本画布和 PDF 渲染依赖，不下载 OCR 模型。
   Windows 用户可先在 Windows PowerShell 中进入解压目录，运行 node compute/dist/member-host-memory.js。若提示虚拟内存占用达到90%，先保存并退出占用较大的程序，再检查。此命令只读取内存状态；它不启动引擎。请在Windows运行，WSL空闲内存不能代表Windows的可用虚拟内存。
3. 在 AcademicCloud“我的研究”的 OCR 连接对话框创建连接码。
4. 在 AcademicCloudComputeV2 的 WSL 终端，以既有 academiccloud 用户进入本包目录，运行：

   npm start -- --core https://cloud.ajtlab.top --pair --detect-installed

5. 粘贴连接码并按 Enter。输入不会显示，日志不会打印令牌。看到 member_ocr.connected 后保留此终端，回网站识别当前页或明确开始私人整书后台任务。

标准共享 Owner 主机需要协调安装具备 native-resource.v1 的 Compute/Bridge 版本并配置相同资源锁。缺少合同会拒绝启动，不能通过删除检查绕过。Catalog 和成员 OCR 使用同一资源锁顺序运行。

共享锁与进程记录在服务用户的私人 coordination 目录中，由整包部署配置。其他 Linux 用户不能借此接入 Owner 主机；不要修改组或开放目录权限。进程异常终止后可能保留安全锁，此时会拒绝运行。管理员须确认后台服务、连接器与所有原生子进程都已停止，再在同一锁文件上执行受锁保护的恢复；不要删除锁文件或绕过检查。

## 其他成员自己的安装

只支持已安装的固定 PaddlePaddle3.3.1/PaddleOCR3.7.0 和 PP-OCRv6 small 两份固定权重。安装资料：https://www.paddleocr.ai/main/quick_start.html 和 https://www.paddlepaddle.org.cn/install/quick 。引擎和模型安装独立于本包，不能把任意安装版本当作已合格。
将 config.example.json 的绝对路径改为自己的 Python、两个模型、本包侧车和私人缓存目录。使用 Linux/WSL 与 Python3 fcntl 资源锁，运行：

   npm start -- --core https://cloud.ajtlab.top --pair --config /absolute/member-ocr.json

--config 与 --detect-installed 互斥；不读取生产.env。共享 Owner 标准主机不能用 sharedHost:false 绕过合作检查。

## 故障和停止

失去权限、连接码失效、缺少合作合同、引擎测试失败会显示受控错误代码；不要粘贴凭据或书页到日志。Catalog 忙碌时等待，不自动切换CPU/云端。整书使用私人临时文件并在停止后清理，每页确认保存后形成断点。关闭网站不会停止已开始的设备任务；本机与终端须持续运行并保持唤醒。关闭终端或 Ctrl+C 会停止本轮处理，等待原生引擎真正关闭后释放资源锁；已确认保存的页面保留。重启连接器或设备后须重新配对，并在网站手动继续、选择新连接。网站可暂停、取消任务或撤销设备；失败页面不自动重新识别。未校对机器文字与行框可能有漏字和表格读序问题；不支持传统蒙古文。结果保持私人，提供既有 TXT/JSONL 导出；本版不会生成可搜索 PDF 或替换线上原件。
`);
const names=['package.json','config.example.json','README.md','compute/dist/member-ocr-main.js','compute/dist/member-book-pdf-worker.js','compute/dist/member-host-memory.js','compute/scripts/paddle_ocr_sidecar.py','compute/scripts/native_resource_lease.py','compute/scripts/member_paddle_offline.py'];
const entries=[];const hashes={};
for(const name of names){const bytes=await readFile(join(kit,name));entries.push({name,bytes});hashes[name]=createHash('sha256').update(bytes).digest('hex');}
const manifest=Buffer.from(JSON.stringify({contract:'academiccloud.member-ocr-kit.v1',esbuild:version,files:hashes},null,2));
await writeFile(join(kit,'SHA256SUMS.json'),manifest);entries.push({name:'SHA256SUMS.json',bytes:manifest});
// Small bounded ZIP with an explicit allow-list; no recursive workspace collection.
const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?(c>>>1)^0xedb88320:c>>>1;return c>>>0;});
const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=(c>>>8)^crcTable[(c^b)&255];return(c^0xffffffff)>>>0;};
let offset=0;const locals=[],centrals=[];
for(const entry of entries){if(/(?:\.env|bootstrap|credential|token|\.png$|\.pdf$)/iu.test(entry.name))throw Error('Forbidden kit entry');
  const name=Buffer.from(entry.name);const sum=crc(entry.bytes);const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(33,12);
  local.writeUInt32LE(sum,14);local.writeUInt32LE(entry.bytes.length,18);local.writeUInt32LE(entry.bytes.length,22);local.writeUInt16LE(name.length,26);locals.push(local,name,entry.bytes);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(33,14);
  central.writeUInt32LE(sum,16);central.writeUInt32LE(entry.bytes.length,20);central.writeUInt32LE(entry.bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);centrals.push(central,name);
  offset+=30+name.length+entry.bytes.length;
}
const center=Buffer.concat(centrals);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(center.length,12);end.writeUInt32LE(offset,16);
const archive=Buffer.concat([...locals,center,end]);if(archive.length>2*1024*1024)throw Error('Kit unexpectedly large');
await writeFile(join(out,'local-ocr-connector.zip'),archive);
console.log(JSON.stringify({path:join(out,'local-ocr-connector.zip'),bytes:archive.length,sha256:createHash('sha256').update(archive).digest('hex'),entries:names.length+1}));
