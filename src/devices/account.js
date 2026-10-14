// -----------------------------------------------------------------------------
// Device: the Withings ACCOUNT, i.e. the person's health data.
//
// A measure belongs to a person, not to the scale that took it (a weight can
// be typed in the app, a heart rate comes from the scale, the monitor or the
// watch): every measure, the daily activity and the last night are features of
// this one device. The physical Withings devices get their own small device
// for their battery (see hardware.js).
//
// Features are added as the account shows data for them, so a blood pressure
// monitor owner does not get twenty empty body-composition features. Adding
// one shows an "Update" button in the Gladys Discovery screen.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { MEASURES, MEASURES_BY_DEVICE_TYPE } from '../withings/measures.js';

export const ACCOUNT_DEVICE_TYPE = 'account';

// Feature keys are stored by Gladys (history, scenes, dashboards): never rename.
export const ACTIVITY_FEATURES = [
  {
    key: 'steps',
    name: 'Steps today',
    category: C.COUNTER_SENSOR,
    type: T.SENSOR.INTEGER,
    min: 0,
    max: 200000,
  },
  {
    key: 'distance',
    name: 'Distance today',
    category: C.DISTANCE_SENSOR,
    type: T.SENSOR.INTEGER,
    unit: U.M,
    min: 0,
    max: 500000,
  },
  {
    key: 'elevation',
    name: 'Elevation climbed today',
    category: C.DISTANCE_SENSOR,
    type: T.SENSOR.INTEGER,
    unit: U.M,
    min: 0,
    max: 20000,
  },
  {
    key: 'active_calories',
    name: 'Active calories today (kcal)',
    category: C.UNKNOWN,
    type: T.UNKNOWN.UNKNOWN,
    min: 0,
    max: 20000,
  },
  {
    key: 'total_calories',
    name: 'Total calories today (kcal)',
    category: C.UNKNOWN,
    type: T.UNKNOWN.UNKNOWN,
    min: 0,
    max: 30000,
  },
];

export const SLEEP_FEATURES = [
  {
    key: 'sleep_duration',
    name: 'Sleep duration',
    category: C.DURATION,
    type: T.DURATION.INTEGER,
    unit: U.MINUTES,
    min: 0,
    max: 1440,
  },
  {
    key: 'deep_sleep_duration',
    name: 'Deep sleep',
    category: C.DURATION,
    type: T.DURATION.INTEGER,
    unit: U.MINUTES,
    min: 0,
    max: 1440,
  },
  {
    key: 'light_sleep_duration',
    name: 'Light sleep',
    category: C.DURATION,
    type: T.DURATION.INTEGER,
    unit: U.MINUTES,
    min: 0,
    max: 1440,
  },
  {
    key: 'rem_sleep_duration',
    name: 'REM sleep',
    category: C.DURATION,
    type: T.DURATION.INTEGER,
    unit: U.MINUTES,
    min: 0,
    max: 1440,
  },
  {
    key: 'sleep_score',
    name: 'Sleep score',
    category: C.UNKNOWN,
    type: T.UNKNOWN.UNKNOWN,
    min: 0,
    max: 100,
  },
  {
    key: 'wakeup_count',
    name: 'Wake-ups',
    category: C.COUNTER_SENSOR,
    type: T.SENSOR.INTEGER,
    min: 0,
    max: 100,
  },
  {
    key: 'sleep_heart_rate',
    name: 'Average heart rate during sleep (bpm)',
    category: C.UNKNOWN,
    type: T.UNKNOWN.UNKNOWN,
    min: 0,
    max: 250,
  },
];

export const IN_BED_FEATURE = {
  key: 'in_bed',
  name: 'In bed',
  category: C.PRESENCE_SENSOR,
  type: T.SENSOR.BINARY,
  min: 0,
  max: 1,
};

// Withings device types whose owner gets the sleep features / the in-bed one.
const SLEEP_DEVICE_TYPES = new Set(['Sleep Monitor', 'Activity Tracker']);
const BED_DEVICE_TYPES = new Set(['Sleep Monitor']);
const ACTIVITY_DEVICE_TYPES = new Set(['Activity Tracker']);

export function accountIds(gladys, userid) {
  return gladys.externalIds(ACCOUNT_DEVICE_TYPE, userid);
}

/**
 * What the account device carries, from what the state knows: measure keys
 * seen in the data or implied by the devices, activity, sleep, bed sensor.
 */
export function accountFeatureKeys(state) {
  const deviceTypes = new Set((state.devices ?? []).map((device) => device.type));
  const measureKeys = new Set(state.measureKeys ?? []);
  for (const type of deviceTypes) {
    for (const key of MEASURES_BY_DEVICE_TYPE[type] ?? []) measureKeys.add(key);
  }
  const keys = MEASURES.filter((measure) => measureKeys.has(measure.key)).map((m) => m.key);
  const hasActivity =
    state.hasActivity || [...deviceTypes].some((type) => ACTIVITY_DEVICE_TYPES.has(type));
  const hasSleep = state.hasSleep || [...deviceTypes].some((type) => SLEEP_DEVICE_TYPES.has(type));
  if (hasActivity) keys.push(...ACTIVITY_FEATURES.map((feature) => feature.key));
  if (hasSleep) keys.push(...SLEEP_FEATURES.map((feature) => feature.key));
  if ([...deviceTypes].some((type) => BED_DEVICE_TYPES.has(type))) keys.push(IN_BED_FEATURE.key);
  return keys;
}

const NON_MEASURE_FEATURES = new Map(
  [...ACTIVITY_FEATURES, ...SLEEP_FEATURES, IN_BED_FEATURE].map((feature) => [
    feature.key,
    feature,
  ]),
);

function featureDefinition(key) {
  const measure = MEASURES.find((m) => m.key === key);
  if (measure) {
    return {
      key,
      name: measure.unitLabel ? `${measure.name.en} (${measure.unitLabel})` : measure.name.en,
      category: measure.category,
      type: measure.type,
      unit: measure.unit,
      min: measure.min,
      max: measure.max,
    };
  }
  return NON_MEASURE_FEATURES.get(key);
}

/** The discovery payload of the account device, or null while there is nothing to show. */
export function buildAccountDevice(gladys, state) {
  if (!state.userid) {
    return null;
  }
  const ids = accountIds(gladys, state.userid);
  const features = accountFeatureKeys(state)
    .map(featureDefinition)
    .map((definition) => ({
      name: definition.name,
      external_id: ids.feature(definition.key),
      category: definition.category,
      type: definition.type,
      ...(definition.unit ? { unit: definition.unit } : {}),
      min: definition.min,
      max: definition.max,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    }));
  if (features.length === 0) {
    return null;
  }
  return {
    name: 'Withings health',
    external_id: ids.device,
    features,
    params: [{ name: 'withings_userid', value: state.userid }],
  };
}
