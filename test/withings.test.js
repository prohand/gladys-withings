// -----------------------------------------------------------------------------
// The Withings modules on their own: API client, OAuth, measures, dates,
// notifications.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { buildAuthorizeUrl, createOAuthStates, createTokenManager } from '../src/withings/auth.js';
import { createWithingsClient, WithingsError } from '../src/withings/client.js';
import { ymd, ymdShift } from '../src/withings/dates.js';
import { MEASURES, measureValue, readGroup } from '../src/withings/measures.js';
import { parseNotification, wantedApplis } from '../src/withings/notify.js';
import { createFakeWithings, group } from './helpers/fakeWithings.js';

test('client: form-encoded POST with the bearer token, body of a status 0', async () => {
  const fake = createFakeWithings({ devices: [{ deviceid: 'd1', type: 'Scale' }] });
  fake.validAccessTokens = new Set(['token']);
  const client = createWithingsClient({ fetch: fake.fetch });
  const devices = await client.getDevices('token');
  assert.deepEqual(devices, [{ deviceid: 'd1', type: 'Scale' }]);
  assert.deepEqual(fake.calls[0], {
    path: '/v2/user',
    params: { action: 'getdevice' },
    token: 'token',
  });
});

test('client: a non-zero status is a WithingsError, 401 an auth error', async () => {
  const fake = createFakeWithings();
  const client = createWithingsClient({ fetch: fake.fetch });
  await assert.rejects(client.getDevices('wrong'), (err) => {
    assert.ok(err instanceof WithingsError);
    assert.equal(err.status, 401);
    assert.equal(err.isAuthError, true);
    return true;
  });
  fake.validAccessTokens = new Set(['token']);
  fake.failures.getdevice = 601;
  await assert.rejects(client.getDevices('token'), (err) => err.isRateLimited);
});

test('client: an HTTP error is an error too', async () => {
  const client = createWithingsClient({
    fetch: async () => ({ ok: false, status: 502, json: async () => ({}) }),
  });
  await assert.rejects(client.getDevices('token'), /HTTP 502/);
});

test('client: listing calls follow the pagination', async () => {
  const pages = [
    { status: 0, body: { measuregrps: [{ grpid: 1 }], more: 1, offset: 1, updatetime: 5 } },
    { status: 0, body: { measuregrps: [{ grpid: 2 }], more: 0, updatetime: 5 } },
  ];
  const offsets = [];
  const client = createWithingsClient({
    fetch: async (url, { body }) => {
      offsets.push(new URLSearchParams(body).get('offset'));
      return { ok: true, status: 200, json: async () => pages.shift() };
    },
  });
  const result = await client.getMeasures('token', { meastypes: [1], lastupdate: 3 });
  assert.deepEqual(
    result.groups.map((g) => g.grpid),
    [1, 2],
  );
  assert.deepEqual(offsets, [null, '1']);
  assert.equal(result.updatetime, 5);
});

test('authorize URL: the Withings page, the scopes, the redirect and the state', () => {
  const url = new URL(
    buildAuthorizeUrl({ clientId: 'abc', redirectUri: 'https://g/cb', state: 'xyz' }),
  );
  assert.equal(url.hostname, 'account.withings.com');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(
    url.searchParams.get('scope'),
    'user.info,user.metrics,user.activity,user.sleepevents',
  );
  assert.equal(url.searchParams.get('redirect_uri'), 'https://g/cb');
  assert.equal(url.searchParams.get('state'), 'xyz');
});

test('OAuth states: used once, expired after a quarter of an hour', () => {
  let now = 0;
  const states = createOAuthStates({ now: () => now });
  const first = states.create('https://g/cb');
  assert.equal(states.consume(first), true);
  assert.equal(states.consume(first), false);
  const second = states.create('https://g/cb');
  now += 16 * 60 * 1000;
  assert.equal(states.consume(second), false);
});

test('tokens: concurrent calls share ONE refresh (the refresh token rotates)', async () => {
  const fake = createFakeWithings();
  fake.refreshTokens = new Set(['refresh-0']);
  const gladys = createFakeGladys();
  const tokens = createTokenManager({
    gladys,
    client: createWithingsClient({ fetch: fake.fetch }),
    getAppConfig: () => ({ client_id: 'client', client_secret: 'secret' }),
    now: () => 1_000_000,
  });
  tokens.load({ access_token: 'old', refresh_token: 'refresh-0', token_expires_at: 0 });
  const [a, b, c] = await Promise.all([
    tokens.getAccessToken(),
    tokens.getAccessToken(),
    tokens.getAccessToken(),
  ]);
  assert.equal(fake.callsOf('requesttoken').length, 1);
  assert.deepEqual([a, b, c], ['access-1', 'access-1', 'access-1']);
  assert.equal(gladys.fake.config.refresh_token, 'refresh-1');
  assert.equal(gladys.fake.config.token_expires_at, 1_000_000 + 10800 * 1000);
});

test('tokens: a refused refresh asks for a reconnection, a network error does not', async () => {
  let fail = 'withings';
  const fake = createFakeWithings();
  const client = createWithingsClient({
    fetch: async (...args) => {
      if (fail === 'network') throw new TypeError('fetch failed');
      return fake.fetch(...args);
    },
  });
  const tokens = createTokenManager({
    gladys: createFakeGladys(),
    client,
    getAppConfig: () => ({ client_id: 'client', client_secret: 'secret' }),
  });
  tokens.load({ refresh_token: 'unknown', token_expires_at: 0 });
  await assert.rejects(tokens.getAccessToken());
  assert.equal(tokens.needsReconnect(), true);
  fail = 'network';
  tokens.load({ refresh_token: 'unknown', token_expires_at: 0 });
  await assert.rejects(tokens.getAccessToken(), /fetch failed/);
  assert.equal(tokens.needsReconnect(), false);
});

test('measures: mantissa x 10^unit, rounded per type', () => {
  const weight = MEASURES.find((m) => m.key === 'weight');
  assert.equal(measureValue({ value: 72453, unit: -3 }, weight), 72.45);
  const systolic = MEASURES.find((m) => m.key === 'systolic');
  assert.equal(measureValue({ value: 1215, unit: -1 }, systolic), 122);
});

test('measures: the kind of a group', () => {
  const kind = (measures) => readGroup(group({ grpid: 1, date: 1, measures })).kind;
  assert.equal(kind({ 1: [7000, -2], 11: [60, 0] }), 'body');
  assert.equal(kind({ 9: [80, 0], 10: [120, 0], 11: [60, 0] }), 'blood_pressure');
  assert.equal(kind({ 71: [370, -1] }), 'temperature');
  assert.equal(kind({ 54: [97, 0] }), 'spo2');
  assert.equal(kind({ 11: [60, 0] }), 'other');
  // Types the integration does not follow are ignored.
  assert.deepEqual(readGroup(group({ grpid: 1, date: 1, measures: { 999: [1, 0] } })).values, {});
});

test('measure keys and Withings types are unique', () => {
  assert.equal(new Set(MEASURES.map((m) => m.key)).size, MEASURES.length);
  assert.equal(new Set(MEASURES.map((m) => m.id)).size, MEASURES.length);
});

test('dates: the day in the account timezone, UTC for an unknown zone', () => {
  const ms = Date.UTC(2024, 0, 1, 23, 30);
  assert.equal(ymd(ms, 'Europe/Paris'), '2024-01-02');
  assert.equal(ymd(ms, 'UTC'), '2024-01-01');
  assert.equal(ymd(ms, 'Not/AZone'), '2024-01-01');
  assert.equal(ymdShift(ms, -2), '2023-12-30');
});

test('notifications: form body, JSON body, decoded body, empty verification call', () => {
  assert.deepEqual(parseNotification({ body: 'userid=12&appli=44&startdate=1&enddate=2' }), {
    userid: '12',
    appli: 44,
    startdate: 1,
    enddate: 2,
    date: 0,
  });
  assert.equal(parseNotification({ body: '{"userid":12,"appli":50}' }).appli, 50);
  assert.equal(parseNotification({ body: { userid: 12, appli: '1' } }).appli, 1);
  assert.equal(parseNotification({ body: '' }).appli, 0);
  assert.equal(parseNotification({ query: { appli: '4' } }).appli, 4);
  assert.equal(parseNotification().appli, 0);
});

test('notifications: the bed applis only with a Sleep Analyzer', () => {
  assert.ok(!wantedApplis({ devices: [{ type: 'Scale' }] }).includes(50));
  assert.ok(wantedApplis({ devices: [{ type: 'Sleep Monitor' }] }).includes(51));
});
