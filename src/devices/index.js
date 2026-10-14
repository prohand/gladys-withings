// -----------------------------------------------------------------------------
// The devices published to Gladys, built from what the state knows of the
// Withings account (see src/state.js): the account device (the person's
// measures, activity and sleep) and one device per battery-powered Withings
// device.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { buildAccountDevice } from './account.js';
import { buildHardwareDevice, hasBattery } from './hardware.js';

/** The discovery payload: every device the integration offers. */
export function buildDiscoveredDevices(gladys, state) {
  const account = buildAccountDevice(gladys, state);
  const hardware = (state.devices ?? [])
    .filter(hasBattery)
    .map((device) => buildHardwareDevice(gladys, device));
  return [...(account ? [account] : []), ...hardware];
}

/**
 * The transport badge of every device: all of them come from the Withings
 * cloud, so the badge says whether the last read of the API worked.
 */
export function buildTransportEntries(gladys, state, reachable) {
  return buildDiscoveredDevices(gladys, state).map((device) => ({
    external_id: device.external_id,
    transport: reachable ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE,
  }));
}
