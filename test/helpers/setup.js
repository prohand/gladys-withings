// -----------------------------------------------------------------------------
// One integration under test: the SDK fake Gladys, the fake Withings API, a
// state file in a temporary directory and a clock the test moves.
// -----------------------------------------------------------------------------

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { createStateStore } from '../../src/state.js';
import { createWithingsClient } from '../../src/withings/client.js';
import { createFakeWithings } from './fakeWithings.js';

// 2023-11-14T22:13:20Z: the fake measures are dated around it.
export const NOW_S = 1_700_000_000;

/** Timers the test fires by hand: nothing runs behind its back. */
export function manualTimers() {
  const pending = new Map();
  let next = 1;
  return {
    pending,
    setInterval(fn, ms) {
      const id = next++;
      pending.set(id, { fn, ms, repeat: true });
      return id;
    },
    clearInterval(id) {
      pending.delete(id);
    },
    setTimeout(fn, ms) {
      const id = next++;
      pending.set(id, { fn, ms, repeat: false });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    /** Run every pending timeout (intervals stay armed and are not run). */
    async fire() {
      for (const [id, timer] of [...pending]) {
        if (timer.repeat) continue;
        pending.delete(id);
        await timer.fn();
      }
    },
  };
}

export const LINKED_CONFIG = {
  client_id: 'client',
  client_secret: 'secret',
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  token_expires_at: (NOW_S + 3 * 3600) * 1000,
  withings_userid: '4242',
};

/**
 * Build everything. `withings` options seed the fake API; `config` the Gladys
 * configuration. Tokens of LINKED_CONFIG are accepted by the fake API.
 */
export async function setup({ config = {}, withings = {}, webhooks, now } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'withings-test-'));
  const fakeWithings = createFakeWithings(withings);
  fakeWithings.tokenCount = 1;
  fakeWithings.validAccessTokens = new Set(['access-1']);
  fakeWithings.refreshTokens = new Set(['refresh-1']);
  const clock = { ms: NOW_S * 1000 };
  const timers = manualTimers();
  const gladys = createFakeGladys({ config, webhooks });
  const store = createStateStore({ file: path.join(dir, 'state.json') });
  const app = createApp(gladys, {
    client: createWithingsClient({ fetch: fakeWithings.fetch }),
    store,
    now: now ?? (() => clock.ms),
    timers,
  });
  return {
    gladys,
    fake: fakeWithings,
    store,
    app,
    clock,
    timers,
    async cleanup() {
      app.stop();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
