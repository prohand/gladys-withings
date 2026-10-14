import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  DEFAULT_CONFIG,
  hasDeveloperApp,
  normalizeConfig,
  userSettingsChanged,
} from '../src/config.js';
import { buildDiscoveredDevices } from '../src/devices/index.js';
import { localize, pick } from '../src/i18n.js';
import { createStateStore } from '../src/state.js';

test('normalizeConfig: defaults, types forced, bounds applied', () => {
  assert.deepEqual(
    Object.fromEntries(Object.keys(DEFAULT_CONFIG).map((k) => [k, normalizeConfig()[k]])),
    DEFAULT_CONFIG,
  );
  const config = normalizeConfig({
    client_id: ' abc ',
    refresh_interval: '2',
    steps_goal: '12000',
    use_webhooks: false,
    token_expires_at: '42',
  });
  assert.equal(config.client_id, 'abc');
  assert.equal(config.refresh_interval, 5);
  assert.equal(config.steps_goal, 12000);
  assert.equal(config.use_webhooks, false);
  assert.equal(config.token_expires_at, 42);
  assert.equal(normalizeConfig({ refresh_interval: '' }).refresh_interval, 30);
  assert.equal(normalizeConfig({ refresh_interval: 99999 }).refresh_interval, 1440);
});

test('only the keys of the Configuration screen count as a user change', () => {
  const before = normalizeConfig({ client_id: 'a', client_secret: 'b' });
  assert.equal(
    userSettingsChanged(before, normalizeConfig({ ...before, access_token: 'x' })),
    false,
  );
  assert.equal(userSettingsChanged(before, normalizeConfig({ ...before, steps_goal: 5000 })), true);
  assert.equal(hasDeveloperApp(before), true);
  assert.equal(hasDeveloperApp(normalizeConfig({ client_id: 'a' })), false);
});

test('i18n: every language, English as the fallback', () => {
  assert.deepEqual(Object.keys(localize(() => 'x')), ['en', 'fr', 'de', 'es']);
  assert.equal(pick('it', { en: 'hello', fr: 'bonjour' }), 'hello');
});

test('state: persisted in its file, reset for another account', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'withings-state-'));
  const file = path.join(dir, 'nested', 'state.json');
  try {
    const store = createStateStore({ file });
    await store.load();
    await store.update({ userid: '1', measuresCursor: 99, redirectUri: 'https://g/cb' });
    assert.equal(JSON.parse(await readFile(file, 'utf8')).measuresCursor, 99);

    const again = createStateStore({ file });
    assert.equal((await again.load()).measuresCursor, 99);
    await again.reset('2');
    assert.equal(again.get().measuresCursor, 0);
    assert.equal(again.get().userid, '2');
    assert.equal(again.get().redirectUri, 'https://g/cb');

    await writeFile(file, 'not json');
    assert.equal((await createStateStore({ file }).load()).userid, '');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('devices: account features follow the data, hardware only with a battery', () => {
  const gladys = createFakeGladys();
  const devices = buildDiscoveredDevices(gladys, {
    userid: '7',
    measureKeys: ['spo2'],
    hasActivity: false,
    hasSleep: false,
    devices: [
      { deviceid: 'bp', type: 'Blood Pressure Monitor', model: 'BPM Connect', battery: 'medium' },
      { deviceid: 'sa', type: 'Sleep Monitor', model: 'Sleep Analyzer', battery: 'n/a' },
    ],
  });
  assert.equal(devices.length, 2);
  const [account, monitor] = devices;
  const keys = account.features.map((f) => f.external_id.split(':').pop());
  assert.deepEqual(keys, [
    'systolic',
    'diastolic',
    'heart_rate',
    'spo2',
    'sleep_duration',
    'deep_sleep_duration',
    'light_sleep_duration',
    'rem_sleep_duration',
    'sleep_score',
    'wakeup_count',
    'sleep_heart_rate',
    'in_bed',
  ]);
  assert.equal(account.external_id, 'ext:test-integration:account:7');
  assert.equal(monitor.external_id, 'ext:test-integration:device:bp');
  // Gladys stores min/max NOT NULL: every feature declares them.
  for (const feature of devices.flatMap((d) => d.features)) {
    assert.equal(typeof feature.min, 'number', feature.external_id);
    assert.equal(typeof feature.max, 'number', feature.external_id);
  }
  assert.deepEqual(buildDiscoveredDevices(gladys, { userid: '', devices: [] }), []);
});
