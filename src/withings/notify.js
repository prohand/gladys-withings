// -----------------------------------------------------------------------------
// Withings notifications, relayed by Gladys Plus.
//
// Withings can POST to a public URL when new data arrives (a weigh-in, a night,
// someone getting into bed). A Gladys at home is not reachable from the
// Internet: the manifest declares a `notify` webhook, Gladys Plus gives it a
// public URL and relays the calls to `onWebhook('notify')`.
//
// Doctrine "trigger, not data": a notification only says "something changed
// between these dates". It starts a synchronization through the API, which
// stays the source of truth — a lost notification costs a delay until the
// next timer, never a value. The one exception is the bed sensor: "in bed" /
// "out of bed" exist ONLY as notifications.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'notify' });

export const NOTIFY_WEBHOOK = 'notify';

// Withings "appli" codes (data categories) the integration subscribes to.
export const APPLI = {
  WEIGHT: 1,
  TEMPERATURE: 2,
  PRESSURE: 4,
  ACTIVITY: 16,
  SLEEP: 44,
  BED_IN: 50,
  BED_OUT: 51,
};

const DATA_APPLIS = [APPLI.WEIGHT, APPLI.TEMPERATURE, APPLI.PRESSURE, APPLI.ACTIVITY, APPLI.SLEEP];
const BED_APPLIS = [APPLI.BED_IN, APPLI.BED_OUT];

/**
 * The notification fields, whatever shape the relay hands over: Withings
 * posts `application/x-www-form-urlencoded`, which may arrive as the raw
 * string or already decoded; the verification call of a subscription may
 * carry nothing at all.
 */
export function parseNotification({ body, query } = {}) {
  let fields = {};
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (trimmed.startsWith('{')) {
      try {
        fields = JSON.parse(trimmed);
      } catch {
        fields = {};
      }
    } else {
      fields = Object.fromEntries(new URLSearchParams(trimmed));
    }
  } else if (body && typeof body === 'object') {
    fields = body;
  }
  const merged = { ...(query ?? {}), ...fields };
  return {
    userid: merged.userid === undefined ? '' : String(merged.userid),
    appli: Number(merged.appli) || 0,
    startdate: Number(merged.startdate) || 0,
    enddate: Number(merged.enddate) || 0,
    date: Number(merged.date) || 0,
  };
}

/** The applis to subscribe to: the bed ones only with a Sleep Analyzer. */
export function wantedApplis(state) {
  const hasBed = (state.devices ?? []).some((device) => device.type === 'Sleep Monitor');
  return hasBed ? [...DATA_APPLIS, ...BED_APPLIS] : DATA_APPLIS;
}

/**
 * Register (or remove) the Gladys Plus URL at Withings, best effort.
 *
 * Resolves `{ status, url?, failed? }`, `status` being:
 *   - `disabled`: notifications turned off in the configuration;
 *   - `unavailable`: no Gladys Plus linked (or no URL yet): timer only;
 *   - `registered`: every appli subscribed (`failed` lists the refused ones).
 */
export async function registerNotifications({ gladys, client, tokens, store, config }) {
  const state = store.get();
  const token = await tokens.getAccessToken();

  async function revokeOld(url, applis) {
    for (const appli of applis) {
      try {
        await client.revoke(token, { callbackurl: url, appli });
      } catch (err) {
        logger.debug(`Revoking appli ${appli} failed: ${err.message}`);
      }
    }
  }

  if (!config.use_webhooks) {
    if (state.webhookUrl) {
      await revokeOld(state.webhookUrl, state.webhookApplis);
      await store.update({ webhookUrl: '', webhookApplis: [] });
    }
    return { status: 'disabled' };
  }

  const { available, webhooks } = await gladys.getWebhooks();
  const url = webhooks?.find((webhook) => webhook.key === NOTIFY_WEBHOOK)?.url;
  if (!available || !url) {
    return { status: 'unavailable' };
  }

  // The Gladys Plus key changed: the old URL is dead, stop Withings calling it.
  if (state.webhookUrl && state.webhookUrl !== url) {
    await revokeOld(state.webhookUrl, state.webhookApplis);
  }

  const applis = wantedApplis(state);
  const failed = [];
  for (const appli of applis) {
    try {
      await client.subscribe(token, { callbackurl: url, appli, comment: 'Gladys Assistant' });
    } catch (err) {
      // Already subscribed answers an error too: the subscription is there.
      logger.debug(`Subscribing appli ${appli}: ${err.message}`);
      failed.push({ appli, message: err.message });
    }
  }
  if (failed.length === applis.length) {
    logger.warn(
      `Withings refused every notification subscription (${failed[0].message}): the timer keeps the data up to date`,
    );
  }
  await store.update({ webhookUrl: url, webhookApplis: applis });
  return { status: 'registered', url, failed };
}

/** Stop the notifications (the account is being disconnected). */
export async function unregisterNotifications({ client, tokens, store }) {
  const state = store.get();
  if (!state.webhookUrl) return;
  try {
    const token = await tokens.getAccessToken();
    for (const appli of state.webhookApplis) {
      await client.revoke(token, { callbackurl: state.webhookUrl, appli }).catch(() => {});
    }
  } catch (err) {
    logger.debug(`Could not revoke the notifications: ${err.message}`);
  }
  await store.update({ webhookUrl: '', webhookApplis: [] });
}
