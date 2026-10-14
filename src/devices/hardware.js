// -----------------------------------------------------------------------------
// Device: one physical Withings device (scale, blood pressure monitor, watch,
// Sleep Analyzer, thermometer...).
//
// Its measures belong to the account device (see account.js); what is left to
// the hardware is what wears out: the battery. Withings only says "high",
// "medium" or "low", so the feature is the binary "battery low" Gladys has for
// that, the one a "replace the batteries" scene listens to.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
} from '@gladysassistant/integration-sdk';

export const HARDWARE_DEVICE_TYPE = 'device';

export const BATTERY_LOW_FEATURE = 'battery_low';

// Withings models answered without a battery (mains-powered Sleep Analyzer).
const NO_BATTERY = new Set(['', 'unknown', 'n/a']);

/** The Withings id of a device: `deviceid`, `hash_deviceid` for older APIs. */
export function hardwareId(device) {
  return String(device.deviceid ?? device.hash_deviceid ?? '');
}

export function hardwareIds(gladys, device) {
  return gladys.externalIds(HARDWARE_DEVICE_TYPE, hardwareId(device));
}

export function hasBattery(device) {
  return !NO_BATTERY.has(String(device.battery ?? '').toLowerCase());
}

/** 1 when Withings reports the battery low, 0 otherwise. */
export function batteryLowState(device) {
  return String(device.battery).toLowerCase() === 'low' ? 1 : 0;
}

export function buildHardwareDevice(gladys, device) {
  const ids = hardwareIds(gladys, device);
  const features = hasBattery(device)
    ? [
        {
          name: 'Battery low',
          external_id: ids.feature(BATTERY_LOW_FEATURE),
          category: C.BATTERY_LOW,
          type: T.BATTERY_LOW.BINARY,
          min: 0,
          max: 1,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
      ]
    : [];
  return {
    name: `Withings ${device.model ?? device.type ?? 'device'}`,
    external_id: ids.device,
    features,
    params: [
      { name: 'model', value: String(device.model ?? '') },
      { name: 'type', value: String(device.type ?? '') },
    ],
  };
}
