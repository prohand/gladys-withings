// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// Each handler receives the RESOLVED fields of the action and the running
// integration (`sync`, `store`), and resolves the outputs declared in the
// manifest — scalars only. Throwing fails this action only; the scene goes on.
//
// The triggers are fired by the synchronization and the notifications (see
// src/withings/sync.js and src/app.js); their keys are in ./triggers.js.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { MEASURES_BY_KEY } from '../withings/measures.js';
import { isoFromSeconds } from '../withings/dates.js';

const logger = createLogger({ name: 'scenes' });

// Units of the values a scene can read that are not Withings measures.
const OTHER_UNITS = {
  sleep_duration: 'min',
  deep_sleep_duration: 'min',
  light_sleep_duration: 'min',
  rem_sleep_duration: 'min',
  sleep_score: '',
  wakeup_count: '',
  sleep_heart_rate: 'bpm',
};

export const SCENE_ACTIONS = {
  // Read Withings now instead of waiting for the timer or a notification.
  async refresh_data({ sync }) {
    logger.info('Scene action refresh_data');
    const { newMeasurements } = await sync.run('scene');
    return { new_measurements: newMeasurements };
  },

  // The last known value of a measure, to put it in a message or compare it
  // in the following blocks of the scene.
  async get_last_measure({ store }, { fields }) {
    const key = fields.measure;
    const entry = store.get().latest?.[key];
    const unit = MEASURES_BY_KEY.get(key)?.unitLabel ?? OTHER_UNITS[key] ?? '';
    const value = Number(entry?.value);
    if (!entry || !Number.isFinite(value)) {
      return { found: false, value: 0, unit, date: '' };
    }
    return { found: true, value, unit, date: isoFromSeconds(entry.date) };
  },
};
