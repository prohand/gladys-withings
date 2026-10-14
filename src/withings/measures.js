// -----------------------------------------------------------------------------
// The Withings measure types the integration follows.
//
// Withings numbers its measures (`type` 1 = weight, 9 = diastolic blood
// pressure...) and sends each value as an integer mantissa plus a power of
// ten: `{ value: 7245, unit: -2 }` is 72.45. The table below gives every
// followed type its stable feature key (feature external ids are built from
// it: NEVER rename a key), its Gladys category and its labels.
//
// Gladys has no kilogram, beat-per-minute nor mmHg unit: those features use
// the `unknown` category, and their name carries the unit.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';

// What a group of measures is, for the `new_measurement` scene trigger.
export const MEASUREMENT_KINDS = {
  BODY: 'body',
  BLOOD_PRESSURE: 'blood_pressure',
  TEMPERATURE: 'temperature',
  SPO2: 'spo2',
  OTHER: 'other',
};

const unknown = { category: C.UNKNOWN, type: T.UNKNOWN.UNKNOWN };
const percent = { ...unknown, unit: U.PERCENT };
const bodyTemperature = { category: C.TEMPERATURE_SENSOR, type: T.TEMPERATURE_SENSOR.PROBE };

/**
 * Followed measure types. `decimals` rounds the value, `kind` says which kind
 * of measurement the type belongs to, `unitLabel` is shown in scene outputs
 * and in the widget.
 */
export const MEASURES = [
  {
    id: 1,
    key: 'weight',
    kind: 'body',
    ...unknown,
    unitLabel: 'kg',
    min: 0,
    max: 500,
    decimals: 2,
    name: { en: 'Weight', fr: 'Poids', de: 'Gewicht', es: 'Peso' },
  },
  {
    id: 6,
    key: 'fat_ratio',
    kind: 'body',
    ...percent,
    unitLabel: '%',
    min: 0,
    max: 100,
    decimals: 1,
    name: { en: 'Fat ratio', fr: 'Masse grasse (%)', de: 'Fettanteil', es: 'Grasa corporal (%)' },
  },
  {
    id: 8,
    key: 'fat_mass',
    kind: 'body',
    ...unknown,
    unitLabel: 'kg',
    min: 0,
    max: 300,
    decimals: 2,
    name: { en: 'Fat mass', fr: 'Masse grasse', de: 'Fettmasse', es: 'Masa grasa' },
  },
  {
    id: 5,
    key: 'fat_free_mass',
    kind: 'body',
    ...unknown,
    unitLabel: 'kg',
    min: 0,
    max: 300,
    decimals: 2,
    name: { en: 'Fat free mass', fr: 'Masse maigre', de: 'Fettfreie Masse', es: 'Masa magra' },
  },
  {
    id: 76,
    key: 'muscle_mass',
    kind: 'body',
    ...unknown,
    unitLabel: 'kg',
    min: 0,
    max: 300,
    decimals: 2,
    name: { en: 'Muscle mass', fr: 'Masse musculaire', de: 'Muskelmasse', es: 'Masa muscular' },
  },
  {
    id: 88,
    key: 'bone_mass',
    kind: 'body',
    ...unknown,
    unitLabel: 'kg',
    min: 0,
    max: 50,
    decimals: 2,
    name: { en: 'Bone mass', fr: 'Masse osseuse', de: 'Knochenmasse', es: 'Masa ósea' },
  },
  {
    id: 77,
    key: 'hydration',
    kind: 'body',
    ...unknown,
    unitLabel: 'kg',
    min: 0,
    max: 200,
    decimals: 2,
    name: { en: 'Body water', fr: 'Eau corporelle', de: 'Körperwasser', es: 'Agua corporal' },
  },
  {
    id: 170,
    key: 'visceral_fat',
    kind: 'body',
    ...unknown,
    unitLabel: '',
    min: 0,
    max: 100,
    decimals: 1,
    name: {
      en: 'Visceral fat index',
      fr: 'Indice de graisse viscérale',
      de: 'Viszeralfett-Index',
      es: 'Índice de grasa visceral',
    },
  },
  {
    id: 10,
    key: 'systolic',
    kind: 'blood_pressure',
    ...unknown,
    unitLabel: 'mmHg',
    min: 0,
    max: 300,
    decimals: 0,
    name: {
      en: 'Systolic blood pressure',
      fr: 'Tension systolique',
      de: 'Systolischer Blutdruck',
      es: 'Presión sistólica',
    },
  },
  {
    id: 9,
    key: 'diastolic',
    kind: 'blood_pressure',
    ...unknown,
    unitLabel: 'mmHg',
    min: 0,
    max: 200,
    decimals: 0,
    name: {
      en: 'Diastolic blood pressure',
      fr: 'Tension diastolique',
      de: 'Diastolischer Blutdruck',
      es: 'Presión diastólica',
    },
  },
  {
    id: 11,
    key: 'heart_rate',
    kind: 'body',
    ...unknown,
    unitLabel: 'bpm',
    min: 0,
    max: 250,
    decimals: 0,
    name: {
      en: 'Heart rate',
      fr: 'Fréquence cardiaque',
      de: 'Herzfrequenz',
      es: 'Frecuencia cardíaca',
    },
  },
  {
    id: 54,
    key: 'spo2',
    kind: 'spo2',
    ...percent,
    unitLabel: '%',
    min: 0,
    max: 100,
    decimals: 0,
    name: {
      en: 'Blood oxygen (SpO2)',
      fr: 'Oxygène sanguin (SpO2)',
      de: 'Blutsauerstoff (SpO2)',
      es: 'Oxígeno en sangre (SpO2)',
    },
  },
  {
    id: 71,
    key: 'body_temperature',
    kind: 'temperature',
    ...bodyTemperature,
    unit: U.CELSIUS,
    unitLabel: '°C',
    min: 30,
    max: 45,
    decimals: 1,
    name: {
      en: 'Body temperature',
      fr: 'Température corporelle',
      de: 'Körpertemperatur',
      es: 'Temperatura corporal',
    },
  },
  {
    id: 73,
    key: 'skin_temperature',
    kind: 'temperature',
    ...bodyTemperature,
    unit: U.CELSIUS,
    unitLabel: '°C',
    min: 20,
    max: 45,
    decimals: 1,
    name: {
      en: 'Skin temperature',
      fr: 'Température cutanée',
      de: 'Hauttemperatur',
      es: 'Temperatura de la piel',
    },
  },
  {
    id: 91,
    key: 'pulse_wave_velocity',
    kind: 'other',
    category: C.SPEED_SENSOR,
    type: T.SPEED_SENSOR.DECIMAL,
    unit: U.METER_PER_SECOND,
    unitLabel: 'm/s',
    min: 0,
    max: 30,
    decimals: 1,
    name: {
      en: 'Pulse wave velocity',
      fr: "Vitesse de l'onde de pouls",
      de: 'Pulswellengeschwindigkeit',
      es: 'Velocidad de la onda de pulso',
    },
  },
  {
    id: 155,
    key: 'vascular_age',
    kind: 'other',
    ...unknown,
    unit: U.YEARS,
    unitLabel: '',
    min: 0,
    max: 150,
    decimals: 0,
    name: { en: 'Vascular age', fr: 'Âge vasculaire', de: 'Gefäßalter', es: 'Edad vascular' },
  },
];

export const MEASURES_BY_ID = new Map(MEASURES.map((measure) => [measure.id, measure]));
export const MEASURES_BY_KEY = new Map(MEASURES.map((measure) => [measure.key, measure]));
export const MEASURE_TYPE_IDS = MEASURES.map((measure) => measure.id);

/** The measures a Withings device type produces, for the discovery. */
export const MEASURES_BY_DEVICE_TYPE = {
  Scale: [
    'weight',
    'fat_ratio',
    'fat_mass',
    'fat_free_mass',
    'muscle_mass',
    'bone_mass',
    'hydration',
  ],
  'Blood Pressure Monitor': ['systolic', 'diastolic', 'heart_rate'],
  'Smart Connected Thermometer': ['body_temperature'],
};

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** The real value of one Withings measure (`value` x 10^`unit`), rounded. */
export function measureValue(measure, definition) {
  return round(Number(measure.value) * 10 ** Number(measure.unit), definition.decimals);
}

/**
 * The followed values of one measure group, `{ key: value }`, and the kind of
 * measurement the group is.
 */
export function readGroup(group) {
  const values = {};
  for (const measure of group.measures ?? []) {
    const definition = MEASURES_BY_ID.get(Number(measure.type));
    if (definition) {
      values[definition.key] = measureValue(measure, definition);
    }
  }
  let kind = MEASUREMENT_KINDS.OTHER;
  if ('systolic' in values || 'diastolic' in values) {
    kind = MEASUREMENT_KINDS.BLOOD_PRESSURE;
  } else if (MEASURES.some((m) => m.kind === 'body' && m.key !== 'heart_rate' && m.key in values)) {
    kind = MEASUREMENT_KINDS.BODY;
  } else if ('body_temperature' in values || 'skin_temperature' in values) {
    kind = MEASUREMENT_KINDS.TEMPERATURE;
  } else if ('spo2' in values) {
    kind = MEASUREMENT_KINDS.SPO2;
  }
  return { values, kind };
}
