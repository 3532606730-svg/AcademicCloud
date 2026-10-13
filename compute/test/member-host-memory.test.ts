import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessWindowsHostMemory, checkWindowsHostMemory } from '../src/member-host-memory.js';

const sample = { CommittedBytes: 34219827200, CommitLimit: 68381425664, AvailableBytes: 4396388352 };

test('Windows commit counters are distinct from physical availability and publish numeric fields only', () => {
  const result = assessWindowsHostMemory(sample);
  assert.equal(result.status, 'observed');
  assert.equal(result.commitHeadroomBytes, 34161598464);
  assert.equal(result.availablePhysicalBytes, sample.AvailableBytes);
  assert.deepEqual(Object.keys(result).sort(), ['availablePhysicalBytes', 'commitHeadroomBytes', 'commitLimitBytes', 'committedBytes', 'event', 'status']);
});

test('90 percent commit pressure is detected even with substantial free physical memory', () => {
  assert.equal(assessWindowsHostMemory({ CommittedBytes: 90, CommitLimit: 100, AvailableBytes: 10000 }).status, 'pressure');
  assert.equal(assessWindowsHostMemory({ CommittedBytes: 89, CommitLimit: 100, AvailableBytes: 0 }).status, 'observed');
});

test('missing, malformed, extra, oversized and inconsistent counters never report an observed sample', () => {
  for (const value of [null, [], {}, { ...sample, CommittedBytes: '1' }, { ...sample, CommitLimit: 0 },
    { ...sample, AvailableBytes: -1 }, { ...sample, AvailableBytes: Number.MAX_SAFE_INTEGER + 1 },
    { ...sample, CommittedBytes: sample.CommitLimit + 1 }, { ...sample, commandLine: 'private-content' }]) {
    assert.equal(assessWindowsHostMemory(value).status, 'unknown');
  }
});

test('Linux and WSL cannot claim Windows host readiness or launch Windows interoperability', async () => {
  const result = await checkWindowsHostMemory({ platform: 'linux', execute: async () => { throw Error('must not run'); } });
  assert.equal(result.status, 'unsupported');
  assert.equal(result.commitHeadroomBytes, null);
});

test('Windows probe uses a fixed hidden bounded command without changing execution policy', async () => {
  const result = await checkWindowsHostMemory({ platform: 'win32', systemRoot: 'C:\\Windows', execute: async (file, args, options) => {
    assert.equal(file, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.deepEqual(args?.slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command']);
    assert.ok(args?.[3]?.includes('Win32_PerfFormattedData_PerfOS_Memory'));
    assert.ok(!args?.join(' ').includes('ExecutionPolicy'));
    assert.equal(options?.timeout, 5000); assert.equal(options?.maxBuffer, 4096); assert.equal(options?.windowsHide, true);
    return { stdout: '\uFEFF' + JSON.stringify(sample), stderr: '' };
  } });
  assert.equal(result.status, 'observed');
});

test('probe errors and invalid roots stay content-free and fail with unknown status', async () => {
  for (const execute of [async () => { throw Error('secret stderr / process command'); },
    async () => ({ stdout: 'private-content', stderr: 'secret stderr' })]) {
    assert.equal(JSON.stringify(await checkWindowsHostMemory({ platform: 'win32', systemRoot: 'C:\\Windows', execute })).includes('secret'), false);
    assert.equal((await checkWindowsHostMemory({ platform: 'win32', systemRoot: 'C:\\Windows', execute })).status, 'unknown');
  }
  for (const systemRoot of ['', 'relative', 'C:\\Windows\nprivate']) {
    assert.equal((await checkWindowsHostMemory({ platform: 'win32', systemRoot, execute: async () => { throw Error('must not run'); } })).status, 'unknown');
  }
});
