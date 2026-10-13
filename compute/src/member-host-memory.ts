import { execFile } from 'node:child_process';
import { win32 } from 'node:path';
import { promisify } from 'node:util';

export type HostMemoryAssessment = {
  event: 'member_ocr.host_memory';
  status: 'observed' | 'pressure' | 'unknown' | 'unsupported';
  committedBytes: number | null;
  commitLimitBytes: number | null;
  commitHeadroomBytes: number | null;
  availablePhysicalBytes: number | null;
};

const MEMORY_COMMAND = "$ErrorActionPreference='Stop'; Get-CimInstance -ClassName Win32_PerfFormattedData_PerfOS_Memory -OperationTimeoutSec 3 | Select-Object CommittedBytes,CommitLimit,AvailableBytes | ConvertTo-Json -Compress";
const runFile = promisify(execFile);
type MemoryExecutor = (file: string, args: readonly string[], options: {
  windowsHide: boolean; timeout: number; maxBuffer: number; encoding: 'utf8';
}) => Promise<{ stdout: string; stderr: string }>;
const executeMemoryCommand: MemoryExecutor = (file, args, options) => {
  const pending = runFile(file, args, options);
  pending.child.stdin?.end();
  return pending;
};
function unavailable(status: 'unknown' | 'unsupported'): HostMemoryAssessment {
  return { event: 'member_ocr.host_memory', status, committedBytes: null, commitLimitBytes: null,
    commitHeadroomBytes: null, availablePhysicalBytes: null };
}

/** A resource-pressure snapshot, never an engine-readiness or native-lease grant. */
export function assessWindowsHostMemory(value: unknown): HostMemoryAssessment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable('unknown');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(',') !== 'AvailableBytes,CommitLimit,CommittedBytes') return unavailable('unknown');
  const { CommittedBytes: committed, CommitLimit: limit, AvailableBytes: available } = input;
  if (![committed, limit, available].every(number => typeof number === 'number' && Number.isSafeInteger(number) && number >= 0)
    || Number(limit) === 0 || Number(committed) > Number(limit)) return unavailable('unknown');
  return { event: 'member_ocr.host_memory', status: Number(committed) / Number(limit) >= 0.9 ? 'pressure' : 'observed',
    committedBytes: Number(committed), commitLimitBytes: Number(limit), commitHeadroomBytes: Number(limit) - Number(committed),
    availablePhysicalBytes: Number(available) };
}

export async function checkWindowsHostMemory(options: {
  platform?: string;
  systemRoot?: string;
  execute?: MemoryExecutor;
} = {}): Promise<HostMemoryAssessment> {
  if ((options.platform ?? process.platform) !== 'win32') return unavailable('unsupported');
  const systemRoot = options.systemRoot ?? process.env.SystemRoot;
  if (!systemRoot || !/^[A-Za-z]:\\/u.test(systemRoot) || /[\r\n\0]/u.test(systemRoot)) return unavailable('unknown');
  try {
    const { stdout } = await (options.execute ?? executeMemoryCommand)(
      win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', MEMORY_COMMAND],
      { windowsHide: true, timeout: 5_000, maxBuffer: 4_096, encoding: 'utf8' },
    );
    return assessWindowsHostMemory(JSON.parse(String(stdout).replace(/^\uFEFF/u, '').trim()) as unknown);
  } catch {
    // Do not propagate shell stderr or process details into a diagnostic event.
    return unavailable('unknown');
  }
}

async function main(): Promise<void> {
  const result = await checkWindowsHostMemory();
  console.log(JSON.stringify(result));
  if (result.status === 'pressure') {
    console.log('Windows 虚拟内存占用已达 90%。请先保存并退出占用较大的程序，再检查。');
  } else if (result.status === 'unsupported') {
    console.log('Windows 用户请在 Windows PowerShell 中运行此命令。WSL 内的空闲内存不能代表 Windows 的可用虚拟内存。');
  } else if (result.status === 'unknown') {
    console.log('未能读取 Windows 内存状态，请在 Windows PowerShell 中重试。');
  } else {
    console.log('此次 Windows 内存占用未达到 90% 告警线。连接时仍需通过引擎测试。');
  }
  process.exitCode = result.status === 'observed' ? 0 : result.status === 'pressure' ? 2 : 1;
}

if (process.argv[1] && /(?:^|[\\/])member-host-memory\.(?:js|ts)$/u.test(process.argv[1])) {
  void main();
}
