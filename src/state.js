// -----------------------------------------------------------------------------
// What the integration remembers between two starts, in /data (the only
// writable path of the container).
//
// Withings is read incrementally: `getmeas` answers the groups modified since
// a cursor, and the last night or the steps goal are announced once. Without
// this file, every restart would publish the same measures again (duplicate
// points in the Gladys history) and fire the scene triggers a second time.
//
// The state belongs to ONE Withings account: connecting another one resets it.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'state' });

export const DEFAULT_STATE_FILE = '/data/withings-state.json';

const EMPTY_STATE = {
  // Withings user id the state below belongs to.
  userid: '',
  // `updatetime` of the last getmeas: the next one asks what changed since.
  measuresCursor: 0,
  // Feature keys the account has data for (they become features).
  measureKeys: [],
  hasActivity: false,
  hasSleep: false,
  // The Withings devices of the account, as getdevice describes them.
  devices: [],
  // Last value per feature key: `{ value, date }` (ISO date of the measure).
  latest: {},
  // End of the last night already announced (unix seconds).
  lastSleepEnd: 0,
  // Day (YYYY-MM-DD) the steps goal was last announced.
  stepsGoalDate: '',
  // Last "in bed" state received (1 in bed, 0 out of bed).
  inBed: null,
  // Gladys Plus URL registered at Withings for the notifications.
  webhookUrl: '',
  webhookApplis: [],
  // Redirect URI Gladys gave with the last click on Connect.
  redirectUri: '',
  // Last successful synchronization (ISO date) and the last error.
  lastSync: '',
  lastError: '',
};

/**
 * A small JSON store. Writes are serialized and atomic (temporary file, then
 * rename), a failed write is logged and never breaks the synchronization.
 * @param {{ file?: string }} [options]
 */
export function createStateStore({
  file = process.env.WITHINGS_STATE_FILE || DEFAULT_STATE_FILE,
} = {}) {
  let state = structuredClone(EMPTY_STATE);
  let writing = Promise.resolve();

  async function persist() {
    const snapshot = JSON.stringify(state, null, 2);
    writing = writing.then(async () => {
      try {
        await mkdir(path.dirname(file), { recursive: true });
        const temporary = `${file}.tmp`;
        await writeFile(temporary, snapshot);
        await rename(temporary, file);
      } catch (err) {
        logger.error(`Could not write ${file}`, err);
      }
    });
    await writing;
  }

  return {
    async load() {
      try {
        state = { ...structuredClone(EMPTY_STATE), ...JSON.parse(await readFile(file, 'utf8')) };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Could not read ${file}, starting from scratch`, err);
        }
        state = structuredClone(EMPTY_STATE);
      }
      return state;
    },

    get() {
      return state;
    },

    async update(patch) {
      state = { ...state, ...patch };
      await persist();
      return state;
    },

    /** Start over for another Withings account (the Connect URI is kept). */
    async reset(userid) {
      state = { ...structuredClone(EMPTY_STATE), userid, redirectUri: state.redirectUri };
      await persist();
      return state;
    },
  };
}
