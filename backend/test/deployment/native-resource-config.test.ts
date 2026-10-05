import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../../', import.meta.url);
test('both shared-host services can write the same private coordination directory', () => {
  const guard = JSON.parse(readFileSync(new URL('deployment/env/native-resource-guard.example.json', root), 'utf8'));
  assert.deepEqual(guard, { pythonPath: '/usr/bin/python3', lockPath: '/srv/academiccloud-compute/coordination/native-resource.lock' });
  for (const name of ['academiccloud-local-compute', 'academiccloud-catalog-bridge']) {
    const unit = readFileSync(new URL(`deployment/systemd/${name}.service`, root), 'utf8');
    assert.match(unit, /^User=academiccloud$/mu);
    assert.match(unit, /^Environment=ACADEMICCLOUD_NATIVE_RESOURCE_GUARD_CONFIG=\/srv\/academiccloud-compute\/control\/native-resource-guard\.json$/mu);
    assert.match(unit, /^ReadWritePaths=\/srv\/academiccloud-compute\/logs \/srv\/academiccloud-compute\/tmp \/srv\/academiccloud-compute\/coordination$/mu);
    assert.match(unit, /^ProtectSystem=strict$/mu);
    assert.match(unit, /^KillMode=control-group$/mu);
  }
});
