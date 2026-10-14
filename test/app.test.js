// -----------------------------------------------------------------------------
// The whole integration (src/app.js) on the SDK fake Gladys and the fake
// Withings API: what Gladys receives for what Withings answers.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { group } from './helpers/fakeWithings.js';
import { LINKED_CONFIG, NOW_S, setup } from './helpers/setup.js';

const SCALE = { deviceid: 'scale-1', type: 'Scale', model: 'Body+', battery: 'high' };
const SLEEP_ANALYZER = {
  deviceid: 'sleep-1',
  type: 'Sleep Monitor',
  model: 'Sleep Analyzer',
  battery: 'n/a',
};
const WEBHOOKS = {
  available: true,
  webhooks: [{ key: 'notify', mode: 'fire_and_forget', url: 'https://plus.example/hook/abc' }],
};

let current;
afterEach(async () => {
  await current?.cleanup();
  current = undefined;
});

async function start(options) {
  current = await setup(options);
  await current.gladys.connect();
  return current;
}

async function until(condition, label) {
  for (let i = 0; i < 100; i += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting for ${label}`);
}

test('without a developer app, the status asks for the Client ID and secret', async () => {
  const { gladys, fake } = await start();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /Client ID/);
  assert.equal(fake.calls.length, 0);
});

test('with a developer app but no account, the status asks to click Connect', async () => {
  const { gladys } = await start({ config: { client_id: 'client', client_secret: 'secret' } });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /Connect/);
});

test('Connect: authorization URL, code exchange, tokens saved, first synchronization', async () => {
  const { gladys, store } = await start({
    config: { client_id: 'client', client_secret: 'secret' },
    withings: {
      devices: [SCALE],
      groups: [group({ grpid: 1, date: NOW_S - 3600, measures: { 1: [7245, -2], 6: [215, -1] } })],
    },
  });

  const redirectUri = 'https://gladys.local/oauth/callback';
  const { data } = await gladys.fake.oauthAuthorizeUrl('withings_account', redirectUri);
  const authorize = new URL(data.authorize_url);
  assert.equal(
    authorize.origin + authorize.pathname,
    'https://account.withings.com/oauth2_user/authorize2',
  );
  assert.equal(authorize.searchParams.get('client_id'), 'client');
  assert.equal(authorize.searchParams.get('redirect_uri'), redirectUri);
  assert.match(authorize.searchParams.get('scope'), /user\.metrics/);
  assert.equal(store.get().redirectUri, redirectUri);

  // A forged state is refused, the real one accepted once.
  const forged = await gladys.fake.oauthCallback('withings_account', {
    code: 'good-code',
    state: 'forged',
    redirectUri,
  });
  assert.equal(forged.success, false);

  const state = authorize.searchParams.get('state');
  const ack = await gladys.fake.oauthCallback('withings_account', {
    code: 'good-code',
    state,
    redirectUri,
  });
  assert.equal(ack.success, true, ack.error);
  assert.equal(gladys.fake.config.refresh_token, 'refresh-2');
  assert.equal(gladys.fake.config.withings_userid, '4242');
  assert.ok(!JSON.stringify(gladys.fake.config).includes('good-code'));

  await until(() => gladys.fake.discoveredDevices.length === 2, 'the discovery');
  const [account, scale] = gladys.fake.discoveredDevices;
  assert.equal(account.name, 'Withings health');
  assert.ok(account.features.some((f) => f.external_id.endsWith(':weight')));
  assert.equal(scale.name, 'Withings Body+');
  await until(() => gladys.fake.lastState(`${account.external_id}:weight`) === 72.45, 'weight');
  assert.equal(gladys.fake.lastState(`${account.external_id}:fat_ratio`), 21.5);

  const replay = await gladys.fake.oauthCallback('withings_account', {
    code: 'good-code',
    state,
    redirectUri,
  });
  assert.equal(replay.success, false, 'a state is used once');
});

test('a linked account synchronizes on connection, with the measure dates', async () => {
  const { gladys, fake } = await start({
    config: LINKED_CONFIG,
    withings: {
      devices: [SCALE],
      groups: [
        group({ grpid: 1, date: NOW_S - 86400 * 3, measures: { 1: [7300, -2] } }),
        group({ grpid: 2, date: NOW_S - 3600, measures: { 1: [7245, -2] } }),
      ],
    },
  });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  const account = gladys.fake.discoveredDevices[0];
  const weights = gladys.fake.states.filter((s) =>
    s.device_feature_external_id.endsWith(':weight'),
  );
  // First synchronization: the latest value only, at its own date.
  assert.equal(weights.length, 1);
  assert.equal(weights[0].state, 72.45);
  assert.equal(weights[0].created_at, new Date((NOW_S - 3600) * 1000).toISOString());
  assert.equal(gladys.fake.sceneEvents.length, 0, 'nothing old fires a scene');
  assert.deepEqual(
    gladys.fake.transports.slice(-2).map((t) => t.transport),
    ['cloud', 'cloud'],
  );
  assert.ok(account);
  assert.equal(fake.callsOf('getmeas')[0].params.startdate, String(NOW_S - 365 * 86400));
});

test('a new weigh-in after the first synchronization fires new_measurement', async () => {
  const { gladys, fake, app, clock } = await start({
    config: LINKED_CONFIG,
    withings: {
      devices: [SCALE],
      groups: [group({ grpid: 1, date: NOW_S - 86400, measures: { 1: [7300, -2] } })],
    },
  });
  clock.ms += 60_000;
  fake.groups.push(
    group({
      grpid: 2,
      date: NOW_S + 30,
      modified: fake.updatetime + 30,
      measures: { 1: [7210, -2], 6: [208, -1], 11: [64, 0] },
    }),
  );
  fake.updatetime += 60;

  await app.sync.run('test');

  const [event] = gladys.fake.sceneEvents;
  assert.equal(event.key, 'new_measurement');
  assert.equal(event.data.kind, 'body');
  assert.equal(event.data.weight, 72.1);
  assert.equal(event.data.heart_rate, 64);
  assert.equal(event.data.device, gladys.fake.discoveredDevices[0].external_id);
  assert.equal(fake.callsOf('getmeas').at(-1).params.lastupdate, String(NOW_S));
});

test('an expired access token is refreshed once, and the new pair saved', async () => {
  const { gladys, fake } = await start({
    config: { ...LINKED_CONFIG, token_expires_at: NOW_S * 1000 - 1 },
    withings: { devices: [SCALE] },
  });
  assert.equal(fake.callsOf('requesttoken').length, 1);
  assert.equal(gladys.fake.config.access_token, 'access-2');
  assert.equal(gladys.fake.config.refresh_token, 'refresh-2');
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a dead refresh token asks the user to connect again', async () => {
  const { gladys, fake } = await start({
    config: { ...LINKED_CONFIG, refresh_token: 'dead', token_expires_at: 0 },
    withings: { devices: [SCALE] },
  });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /click Connect again/);
  assert.equal(fake.callsOf('getdevice').length, 0);
});

test('Gladys Plus: the notify URL is subscribed, a notification triggers a synchronization', async () => {
  const { gladys, fake, timers } = await start({
    config: LINKED_CONFIG,
    webhooks: WEBHOOKS,
    withings: { devices: [SCALE] },
  });
  assert.deepEqual(
    fake.subscriptions.map((s) => s.appli),
    [1, 2, 4, 16, 44],
  );
  assert.ok(fake.subscriptions.every((s) => s.callbackurl === WEBHOOKS.webhooks[0].url));

  const before = fake.callsOf('getdevice').length;
  await gladys.fake.webhook('notify', {
    method: 'POST',
    body: 'userid=4242&appli=1&startdate=1&enddate=2',
    contentType: 'application/x-www-form-urlencoded',
  });
  // Debounced: nothing yet, one synchronization when the timer fires.
  assert.equal(fake.callsOf('getdevice').length, before);
  await timers.fire();
  assert.equal(fake.callsOf('getdevice').length, before + 1);

  // Another account's notification is ignored.
  await gladys.fake.webhook('notify', { method: 'POST', body: 'userid=1&appli=1' });
  assert.equal([...timers.pending.values()].filter((t) => !t.repeat).length, 0);
});

test('Sleep Analyzer: in bed / out of bed set the presence and fire the triggers once', async () => {
  const { gladys, fake } = await start({
    config: LINKED_CONFIG,
    webhooks: WEBHOOKS,
    withings: { devices: [SLEEP_ANALYZER] },
  });
  assert.ok(fake.subscriptions.some((s) => s.appli === 50));
  const account = gladys.fake.discoveredDevices[0];
  assert.ok(account.features.some((f) => f.external_id.endsWith(':in_bed')));
  // Mains-powered: no battery device.
  assert.equal(gladys.fake.discoveredDevices.length, 1);

  await gladys.fake.webhook('notify', { method: 'POST', body: { userid: '4242', appli: '50' } });
  await gladys.fake.webhook('notify', { method: 'POST', body: { userid: '4242', appli: '50' } });
  await gladys.fake.webhook('notify', { method: 'POST', body: { userid: '4242', appli: '51' } });

  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.key),
    ['bed_in', 'bed_out'],
  );
  assert.equal(gladys.fake.lastState(`${account.external_id}:in_bed`), 0);
});

test('a low battery is published on the device of the scale', async () => {
  const { gladys } = await start({
    config: LINKED_CONFIG,
    withings: { devices: [{ ...SCALE, battery: 'low' }] },
  });
  const scale = gladys.fake.discoveredDevices[1];
  assert.equal(gladys.fake.lastState(`${scale.external_id}:battery_low`), 1);
});

test('activity: today steps, and the goal fires once a day', async () => {
  const today = new Date(NOW_S * 1000).toISOString().slice(0, 10);
  const { gladys, fake, app } = await start({
    config: { ...LINKED_CONFIG, steps_goal: 8000 },
    withings: {
      activities: [
        {
          date: today,
          timezone: 'UTC',
          steps: 8500,
          distance: 6200.4,
          elevation: 12,
          calories: 320,
        },
      ],
    },
  });
  const account = gladys.fake.discoveredDevices[0];
  assert.equal(gladys.fake.lastState(`${account.external_id}:steps`), 8500);
  assert.equal(gladys.fake.lastState(`${account.external_id}:distance`), 6200);
  fake.activities[0].steps = 9000;
  await app.sync.run('test');
  const goals = gladys.fake.sceneEvents.filter((e) => e.key === 'steps_goal_reached');
  assert.equal(goals.length, 1);
  assert.equal(goals[0].data.goal, 8000);
});

test('sleep: the night is published at its end date, the next one is announced', async () => {
  const night = (enddate, score) => ({
    date: 'x',
    startdate: enddate - 8 * 3600,
    enddate,
    data: { total_sleep_time: 7 * 3600, sleep_score: score, wakeupcount: 2 },
  });
  const { gladys, fake, app } = await start({
    config: LINKED_CONFIG,
    withings: { nights: [night(NOW_S - 86400, 70)] },
  });
  const account = gladys.fake.discoveredDevices[0];
  assert.equal(gladys.fake.lastState(`${account.external_id}:sleep_duration`), 420);
  assert.equal(gladys.fake.sceneEvents.length, 0);

  fake.nights.push(night(NOW_S - 600, 85));
  await app.sync.run('test');
  const [event] = gladys.fake.sceneEvents;
  assert.equal(event.key, 'sleep_summary_ready');
  assert.equal(event.data.sleep_score, 85);
  assert.equal(event.data.duration_minutes, 420);
});

test('actions: test the connection, synchronize, disconnect', async () => {
  const { gladys, fake } = await start({
    config: LINKED_CONFIG,
    withings: { devices: [SCALE] },
  });
  const test = await gladys.fake.action('test_connection');
  assert.match(
    test.data.message.en,
    /Connected to Withings account 4242: 1 device\(s\) \(Body\+\)/,
  );
  assert.match(test.data.message.fr, /Connecté au compte Withings 4242/);
  assert.ok(test.data.message.de && test.data.message.es);

  const syncNow = await gladys.fake.action('sync_now');
  assert.match(syncNow.data.message.en, /Synchronized/);

  const unlink = await gladys.fake.action('unlink_account');
  assert.equal(unlink.success, true);
  assert.equal(gladys.fake.config.refresh_token, '');
  assert.equal(gladys.fake.connectionStatus.connected, false);
  const calls = fake.calls.length;
  const again = await gladys.fake.action('test_connection');
  assert.match(again.data.message.en, /Click Connect/);
  assert.equal(fake.calls.length, calls);
});

test('a configuration change restarts, a token echo does not', async () => {
  const { gladys, fake } = await start({ config: LINKED_CONFIG, withings: { devices: [SCALE] } });
  const reads = fake.callsOf('getdevice').length;
  await gladys.fake.configUpdated({ ...gladys.fake.config, access_token: 'access-1' });
  assert.equal(fake.callsOf('getdevice').length, reads);
  await gladys.fake.configUpdated({ ...gladys.fake.config, refresh_interval: 60 });
  assert.equal(fake.callsOf('getdevice').length, reads + 1);
});

test('the timer synchronizes at the configured interval', async () => {
  const { fake, timers } = await start({ config: LINKED_CONFIG, withings: { devices: [SCALE] } });
  const interval = [...timers.pending.values()].find((t) => t.repeat);
  assert.equal(interval.ms, 30 * 60 * 1000);
  const reads = fake.callsOf('getdevice').length;
  await interval.fn();
  assert.equal(fake.callsOf('getdevice').length, reads + 1);
});

test('a device created later gets the known values again', async () => {
  const { gladys } = await start({
    config: LINKED_CONFIG,
    withings: {
      groups: [group({ grpid: 1, date: NOW_S - 3600, measures: { 1: [7245, -2] } })],
    },
  });
  const account = gladys.fake.discoveredDevices[0];
  const count = gladys.fake.states.length;
  await gladys.fake.deviceCreated({ ...account, id: 'uuid' });
  assert.ok(gladys.fake.states.length > count);
  assert.equal(gladys.fake.lastState(`${account.external_id}:weight`), 72.45);
});
