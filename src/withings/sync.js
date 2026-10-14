// -----------------------------------------------------------------------------
// One synchronization of the Withings account with Gladys.
//
// Each run reads the devices, the measures modified since the last run, the
// recent days of activity and the recent nights, then publishes to Gladys:
//   - the discovered devices, when what the account offers changed;
//   - the states: measures with their own date (`created_at`), so a weigh-in
//     synchronized an hour later lands at the right place in the history;
//     today's activity and the batteries as current values;
//   - the scene events (new measurement, night summary, steps goal), only for
//     what is new and recent: a restart or a first connection never replays
//     last month's weigh-ins as scene triggers;
//   - the transport badges and the connection status.
//
// Runs are serialized: a notification arriving during a run asks for one more
// run after it, never for a parallel one (two parallel runs would read the
// same cursor and publish the same measures twice).
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { accountIds, accountFeatureKeys } from '../devices/account.js';
import {
  batteryLowState,
  BATTERY_LOW_FEATURE,
  hardwareIds,
  hasBattery,
} from '../devices/hardware.js';
import { buildDiscoveredDevices } from '../devices/index.js';
import { SCENE_TRIGGERS } from '../capabilities/triggers.js';
import { NotLinkedError } from './auth.js';
import { isoFromSeconds, toSeconds, ymd, ymdShift } from './dates.js';
import { MEASURE_TYPE_IDS, readGroup } from './measures.js';

const logger = createLogger({ name: 'sync' });

const DAY_S = 24 * 60 * 60;
// First synchronization: how far back to look for the measures the account
// has, and the latest value of each.
const FIRST_SYNC_DAYS = 365;
// Only what happened since then fires a scene trigger.
const EVENT_MAX_AGE_S = DAY_S;
// Gladys accepts 300 states a minute: a run after a long outage publishes the
// most recent ones and leaves room for the rest of the minute.
const MAX_HISTORY_STATES = 200;

function sortByDate(groups) {
  return [...groups].sort((a, b) => Number(a.date) - Number(b.date));
}

/** What Gladys needs to remember of a Withings device. */
function describeDevice(device) {
  return {
    deviceid: device.deviceid ?? device.hash_deviceid,
    type: device.type,
    model: device.model,
    battery: device.battery,
    last_session_date: device.last_session_date,
  };
}

export function createSync({ gladys, client, tokens, store, getConfig, now = Date.now }) {
  let running = null;
  let again = false;
  let published = '';

  // A call with the current access token; when Withings refuses it (revoked,
  // expired early), one refresh and one retry.
  async function withToken(call) {
    try {
      return await call(await tokens.getAccessToken());
    } catch (err) {
      if (!err.isAuthError) throw err;
      tokens.expireAccessToken();
      return call(await tokens.getAccessToken());
    }
  }

  async function publishDiscovery(state, force) {
    const devices = buildDiscoveredDevices(gladys, state);
    const serialized = JSON.stringify(devices);
    if (!force && serialized === published) {
      return devices;
    }
    await gladys.publishDiscoveredDevices(devices);
    published = serialized;
    return devices;
  }

  function readMeasures(groups, state, firstSync) {
    const nowS = toSeconds(now());
    const ids = accountIds(gladys, state.userid);
    const latest = { ...state.latest };
    const measureKeys = new Set(state.measureKeys);
    const history = [];
    const events = [];

    for (const group of sortByDate(groups)) {
      const { values, kind } = readGroup(group);
      const keys = Object.keys(values);
      if (keys.length === 0) continue;
      const date = Number(group.date);
      for (const key of keys) {
        measureKeys.add(key);
        if (!latest[key] || date >= latest[key].date) {
          latest[key] = { value: values[key], date };
        }
        if (!firstSync) {
          history.push({
            device_feature_external_id: ids.feature(key),
            state: values[key],
            created_at: isoFromSeconds(date),
          });
        }
      }
      if (!firstSync && date >= nowS - EVENT_MAX_AGE_S) {
        events.push({
          key: SCENE_TRIGGERS.NEW_MEASUREMENT,
          data: { device: ids.device, kind, date: isoFromSeconds(date), ...values },
        });
      }
    }

    // First synchronization: the latest value of each measure only. The
    // history before the integration was installed stays in Withings.
    if (firstSync) {
      for (const [key, { value, date }] of Object.entries(latest)) {
        history.push({
          device_feature_external_id: ids.feature(key),
          state: value,
          created_at: isoFromSeconds(date),
        });
      }
    }
    if (history.length > MAX_HISTORY_STATES) {
      logger.warn(
        `${history.length} measures to publish, only the ${MAX_HISTORY_STATES} most recent are sent`,
      );
    }
    return {
      history: history.slice(-MAX_HISTORY_STATES),
      events,
      latest,
      measureKeys: [...measureKeys],
      newGroups: firstSync ? 0 : groups.length,
    };
  }

  function readActivity(activities, state, config) {
    const ids = accountIds(gladys, state.userid);
    const today = (activity) => ymd(now(), activity.timezone);
    const current = activities.find((activity) => activity.date === today(activity));
    const values = {
      steps: Math.round(current?.steps ?? 0),
      distance: Math.round(current?.distance ?? 0),
      elevation: Math.round(current?.elevation ?? 0),
      active_calories: Math.round(current?.calories ?? 0),
      total_calories: Math.round(current?.totalcalories ?? 0),
    };
    const events = [];
    let stepsGoalDate = state.stepsGoalDate;
    if (current && values.steps >= config.steps_goal && state.stepsGoalDate !== current.date) {
      stepsGoalDate = current.date;
      events.push({
        key: SCENE_TRIGGERS.STEPS_GOAL_REACHED,
        data: { device: ids.device, steps: values.steps, goal: config.steps_goal },
      });
    }
    return { values, events, stepsGoalDate, today: current?.date ?? ymd(now()) };
  }

  function readSleep(series, state) {
    const ids = accountIds(gladys, state.userid);
    const night = [...series].sort((a, b) => Number(b.enddate) - Number(a.enddate))[0];
    if (!night || Number(night.enddate) <= state.lastSleepEnd) {
      return { states: [], events: [], lastSleepEnd: state.lastSleepEnd, values: null };
    }
    const data = night.data ?? {};
    const minutes = (seconds) => Math.round(Number(seconds ?? 0) / 60);
    const values = {
      sleep_duration: minutes(data.total_sleep_time),
      deep_sleep_duration: minutes(data.deepsleepduration),
      light_sleep_duration: minutes(data.lightsleepduration),
      rem_sleep_duration: minutes(data.remsleepduration),
      sleep_score: data.sleep_score,
      wakeup_count: data.wakeupcount,
      sleep_heart_rate: data.hr_average,
    };
    const enddate = Number(night.enddate);
    const createdAt = isoFromSeconds(enddate);
    const states = Object.entries(values)
      .filter(([, value]) => Number.isFinite(Number(value)) && value !== null)
      .map(([key, value]) => ({
        device_feature_external_id: ids.feature(key),
        state: Number(value),
        created_at: createdAt,
      }));
    const events = [];
    // Announced only when a night was already known: the first connection
    // does not wake up the "good morning" scenes for an old night.
    if (state.lastSleepEnd && enddate >= toSeconds(now()) - EVENT_MAX_AGE_S) {
      events.push({
        key: SCENE_TRIGGERS.SLEEP_SUMMARY_READY,
        data: {
          device: ids.device,
          duration_minutes: values.sleep_duration,
          sleep_score: values.sleep_score ?? null,
          wakeup_count: values.wakeup_count ?? null,
        },
      });
    }
    return { states, events, lastSleepEnd: enddate, values };
  }

  async function publishEvents(events) {
    for (const event of events) {
      try {
        await gladys.publishSceneEvent(event.key, event.data);
      } catch (err) {
        logger.error(`Scene event ${event.key} refused`, err);
      }
    }
  }

  async function runOnce(reason) {
    const config = getConfig();
    logger.info(`Synchronizing with Withings (${reason})`);

    const nowMs = now();
    const nowS = toSeconds(nowMs);
    let state = store.get();
    const userid = tokens.userId();
    if (userid && state.userid !== userid) {
      state = await store.reset(userid);
    }
    if (!state.userid) {
      // Tokens without the Withings user id they belong to: only a new
      // Connect can tell which account the data is.
      throw new NotLinkedError('Withings user id unknown');
    }
    const firstSync = !state.measuresCursor;

    const devices = await withToken((token) => client.getDevices(token));
    const measures = await withToken((token) =>
      client.getMeasures(
        token,
        firstSync
          ? { meastypes: MEASURE_TYPE_IDS, startdate: nowS - FIRST_SYNC_DAYS * DAY_S }
          : { meastypes: MEASURE_TYPE_IDS, lastupdate: state.measuresCursor },
      ),
    );
    const activities = await withToken((token) =>
      client.getActivity(token, {
        startdateymd: ymdShift(nowMs, -2),
        enddateymd: ymdShift(nowMs, 1),
      }),
    );
    const nights = await withToken((token) =>
      client.getSleepSummary(token, {
        startdateymd: ymdShift(nowMs, -3),
        enddateymd: ymdShift(nowMs, 1),
      }),
    );

    const measured = readMeasures(measures.groups, state, firstSync);
    const activity = readActivity(activities, state, config);
    const sleep = readSleep(nights, state);

    state = await store.update({
      devices: devices.map(describeDevice),
      measuresCursor: Number(measures.updatetime) || nowS,
      measureKeys: measured.measureKeys,
      latest: {
        ...measured.latest,
        ...(sleep.values
          ? Object.fromEntries(
              Object.entries(sleep.values).map(([key, value]) => [
                key,
                { value, date: sleep.lastSleepEnd },
              ]),
            )
          : {}),
      },
      hasActivity: state.hasActivity || activities.length > 0,
      hasSleep: state.hasSleep || nights.length > 0,
      lastSleepEnd: sleep.lastSleepEnd,
      stepsGoalDate: activity.stepsGoalDate,
      lastSync: new Date(nowMs).toISOString(),
      lastError: '',
    });

    // Devices first: a state for a feature Gladys does not know yet is
    // dropped, so a new feature must exist before its first value.
    await publishDiscovery(state, false);

    const ids = accountIds(gladys, state.userid);
    const features = new Set(accountFeatureKeys(state));
    const current = [];
    if (features.has('steps')) {
      for (const [key, value] of Object.entries(activity.values)) {
        current.push({ device_feature_external_id: ids.feature(key), state: value });
      }
    }
    for (const device of state.devices.filter(hasBattery)) {
      current.push({
        device_feature_external_id: hardwareIds(gladys, device).feature(BATTERY_LOW_FEATURE),
        state: batteryLowState(device),
      });
    }
    // Values that did not change since the last run are not sent again
    // (Gladys accepts 300 states a minute, sized for changes).
    await gladys.publishChangedStates([...measured.history, ...sleep.states, ...current]);
    await publishEvents([...measured.events, ...sleep.events, ...activity.events]);
    await publishTransports(true);

    logger.info(
      `Synchronized: ${devices.length} device(s), ${measured.newGroups} new measurement(s)`,
    );
    return { newMeasurements: measured.newGroups, devices: devices.length };
  }

  async function publishTransports(reachable) {
    const transport = reachable ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE;
    const entries = buildDiscoveredDevices(gladys, store.get()).map((device) => ({
      external_id: device.external_id,
      transport,
    }));
    for (let i = 0; i < entries.length; i += 100) {
      await gladys.publishTransports(entries.slice(i, i + 100));
    }
  }

  return {
    /**
     * Synchronize now. A run already in progress is followed by exactly one
     * more, whatever the number of requests meanwhile.
     */
    run(reason = 'manual') {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        let result;
        do {
          again = false;
          result = await runOnce(reason);
        } while (again);
        return result;
      })().finally(() => {
        running = null;
      });
      return running;
    },

    /** Publish the devices the state knows, even without a new read. */
    publishDiscovery(force = true) {
      return publishDiscovery(store.get(), force);
    },

    publishTransports,

    /**
     * Send the last known values again: Gladys dropped them while the device
     * did not exist (created after the first synchronization).
     */
    async republishLatest() {
      const state = store.get();
      if (!state.userid) return;
      const ids = accountIds(gladys, state.userid);
      const features = new Set(accountFeatureKeys(state));
      const states = Object.entries(state.latest ?? {})
        .filter(([key, entry]) => features.has(key) && Number.isFinite(Number(entry.value)))
        .map(([key, { value, date }]) => ({
          device_feature_external_id: ids.feature(key),
          state: Number(value),
          created_at: isoFromSeconds(date),
        }));
      if (features.has('in_bed') && state.inBed !== null) {
        states.push({ device_feature_external_id: ids.feature('in_bed'), state: state.inBed });
      }
      for (const device of state.devices.filter(hasBattery)) {
        states.push({
          device_feature_external_id: hardwareIds(gladys, device).feature(BATTERY_LOW_FEATURE),
          state: batteryLowState(device),
        });
      }
      await gladys.publishChangedStates(states);
    },
  };
}
