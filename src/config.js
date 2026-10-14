// -----------------------------------------------------------------------------
// Integration configuration.
//
// Two kinds of keys live in the Gladys configuration of this integration:
//   - the ones the user fills in the Configuration screen (`config_schema` of
//     the manifest): the Withings developer app and a few preferences;
//   - the OAuth2 tokens, stored by the integration itself through
//     `gladys.setConfig` OUTSIDE the `config_schema`: never shown in the UI,
//     never sent to the browser.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  client_id: '',
  client_secret: '',
  // Minutes between two reads of the Withings API. Withings data moves slowly
  // (a weigh-in a day, a night of sleep): the notifications relayed by Gladys
  // Plus bring the new measures in seconds, the timer is the safety net.
  refresh_interval: 30,
  steps_goal: 10000,
  use_webhooks: true,
};

// The keys the user owns. A configuration update that changes none of them is
// the echo of our own `setConfig` (tokens) and must not restart anything.
export const USER_KEYS = Object.keys(DEFAULT_CONFIG);

// The keys the integration owns (OAuth2 tokens), written with `setConfig`.
export const TOKEN_KEYS = [
  'access_token',
  'refresh_token',
  'token_expires_at',
  'withings_userid',
  'token_scope',
];

const REFRESH_INTERVAL = { min: 5, max: 1440 };
const STEPS_GOAL = { min: 100, max: 100000 };

function bounded(value, fallback, { min, max }) {
  const number = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function text(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

/**
 * Merge the configuration received from Gladys with the defaults, and force
 * the types: a form may send numbers as strings.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    client_id: text(raw.client_id),
    client_secret: text(raw.client_secret),
    refresh_interval: bounded(
      raw.refresh_interval,
      DEFAULT_CONFIG.refresh_interval,
      REFRESH_INTERVAL,
    ),
    steps_goal: bounded(raw.steps_goal, DEFAULT_CONFIG.steps_goal, STEPS_GOAL),
    // Anything but an explicit false keeps the notifications on.
    use_webhooks: raw.use_webhooks !== false && raw.use_webhooks !== 'false',
    access_token: text(raw.access_token),
    refresh_token: text(raw.refresh_token),
    token_expires_at: Number(raw.token_expires_at) || 0,
    withings_userid: text(raw.withings_userid),
    token_scope: text(raw.token_scope),
  };
}

/** True when the user changed one of the keys of the Configuration screen. */
export function userSettingsChanged(previous, next) {
  return USER_KEYS.some((key) => previous[key] !== next[key]);
}

/** The Withings developer app is filled in: the Connect button can work. */
export function hasDeveloperApp(config) {
  return Boolean(config.client_id && config.client_secret);
}
