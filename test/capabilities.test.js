// -----------------------------------------------------------------------------
// Scene actions and dashboard widgets, through the fake Gladys: the content is
// checked with the SDK's own validator, `[]` meaning "rendered as sent".
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { relativeTime } from '../src/capabilities/widgets.js';
import { group } from './helpers/fakeWithings.js';
import { LINKED_CONFIG, NOW_S, setup } from './helpers/setup.js';

const SCALE = { deviceid: 'scale-1', type: 'Scale', model: 'Body+', battery: 'low' };

let current;
afterEach(async () => {
  await current?.cleanup();
  current = undefined;
});

async function linked() {
  current = await setup({
    config: LINKED_CONFIG,
    withings: {
      devices: [SCALE],
      groups: [group({ grpid: 1, date: NOW_S - 7200, measures: { 1: [7245, -2] } })],
    },
  });
  await current.gladys.connect();
  return current;
}

test('summary widget: valid content, tiles bound to the account features', async () => {
  const { gladys } = await linked();
  const ack = await gladys.fake.widgetGet('withings_summary', { language: 'fr' });
  assert.equal(ack.success, true, ack.error);
  const { content } = ack.data;
  assert.deepEqual(validateWidgetContent(content), []);
  const account = gladys.fake.discoveredDevices[0];
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((t) => t.device_feature),
    [`${account.external_id}:weight`],
  );
  const status = content.components.find((c) => c.type === 'status');
  const battery = status.items.find((item) => item.icon === 'battery');
  assert.match(battery.value, /Faibles: Body\+/);
  assert.equal(status.items[0].value, 'il y a 2 heures');
});

test('summary widget: the refresh button synchronizes and answers a toast', async () => {
  const { gladys, fake } = await linked();
  const reads = fake.callsOf('getdevice').length;
  const ack = await gladys.fake.widgetAction('withings_summary', 'refresh', {}, { settings: {} });
  assert.equal(ack.success, true, ack.error);
  assert.equal(fake.callsOf('getdevice').length, reads + 1);
  const unknown = await gladys.fake.widgetAction('withings_summary', 'nope', {}, { settings: {} });
  assert.equal(unknown.success, false);
});

test('weight widget: a chart of the weight feature over the chosen period', async () => {
  const { gladys } = await linked();
  const ack = await gladys.fake.widgetGet('withings_weight', {
    settings: { interval: 'last-year' },
  });
  const { content } = ack.data;
  assert.deepEqual(validateWidgetContent(content), []);
  const chart = content.components.find((c) => c.type === 'chart');
  assert.equal(chart.interval, 'last-year');
  assert.match(chart.device_features[0], /:weight$/);
});

test('widgets before any account: a valid text asking to connect', async () => {
  current = await setup();
  await current.gladys.connect();
  for (const key of ['withings_summary', 'withings_weight']) {
    const { content } = (await current.gladys.fake.widgetGet(key)).data;
    assert.deepEqual(validateWidgetContent(content), []);
    assert.equal(content.components[0].type, 'text');
  }
});

test('scene action get_last_measure: the value, its unit and its date', async () => {
  const { gladys } = await linked();
  const weight = await gladys.fake.sceneAction('get_last_measure', { measure: 'weight' });
  assert.equal(weight.success, true, weight.error);
  assert.deepEqual(weight.data.outputs, {
    found: true,
    value: 72.45,
    unit: 'kg',
    date: new Date((NOW_S - 7200) * 1000).toISOString(),
  });
  const missing = await gladys.fake.sceneAction('get_last_measure', { measure: 'spo2' });
  assert.equal(missing.data.outputs.found, false);
});

test('scene action refresh_data: synchronizes and counts the new measures', async () => {
  const { gladys, fake } = await linked();
  fake.groups.push(
    group({ grpid: 2, date: NOW_S, modified: fake.updatetime + 1, measures: { 1: [7200, -2] } }),
  );
  fake.updatetime += 10;
  const ack = await gladys.fake.sceneAction('refresh_data', {});
  assert.deepEqual(ack.data.outputs, { new_measurements: 1 });
});

test('relative times read naturally in every language', () => {
  const now = 1_000_000_000_000;
  assert.equal(relativeTime((now - 3 * 3600 * 1000) / 1000, 'en', now), '3 hours ago');
  assert.equal(relativeTime((now - 86400 * 1000) / 1000, 'fr', now), 'hier');
  assert.equal(relativeTime('', 'de', now), 'nie');
  assert.equal(relativeTime(0, 'es', now), 'nunca');
});
