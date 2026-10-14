// -----------------------------------------------------------------------------
// Withings public API client (https://developer.withings.com/api-reference).
//
// Every Withings call is a POST of form-encoded parameters, answered with
// HTTP 200 and a JSON envelope `{ status, body, error }`: `status` 0 is the
// only success, everything else is an error even under HTTP 200. This module
// turns that envelope into a resolved `body` or a thrown `WithingsError`, and
// knows nothing about Gladys.
//
// `fetch` is injectable so the tests never touch the network.
// -----------------------------------------------------------------------------

export const WITHINGS_API_URL = 'https://wbsapi.withings.net';
export const WITHINGS_AUTHORIZE_URL = 'https://account.withings.com/oauth2_user/authorize2';

// user.info: the devices; user.metrics: the measures (weight, blood pressure...);
// user.activity: steps and sleep; user.sleepevents: the "in bed" / "out of
// bed" notifications of a Sleep Analyzer.
export const WITHINGS_SCOPES = ['user.info', 'user.metrics', 'user.activity', 'user.sleepevents'];

// Statuses that mean "the token is not good any more": refreshing or
// reconnecting is the only way out, retrying the same call is pointless.
const AUTH_STATUSES = new Set([100, 101, 102, 200, 401]);
const RATE_LIMIT_STATUS = 601;

// Pages read at most per listing call: getmeas answers 300 groups or so per
// page, a year of daily weigh-ins fits in two.
const MAX_PAGES = 10;

export class WithingsError extends Error {
  /**
   * @param {number} status Withings status (or HTTP status when no envelope)
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.name = 'WithingsError';
    this.status = status;
    this.isAuthError = AUTH_STATUSES.has(status);
    this.isRateLimited = status === RATE_LIMIT_STATUS || status === 429;
  }
}

/**
 * Create the client.
 * @param {{ fetch?: typeof fetch, baseUrl?: string, timeoutMs?: number }} [options]
 */
export function createWithingsClient({
  fetch: fetchImpl = globalThis.fetch,
  baseUrl = WITHINGS_API_URL,
  timeoutMs = 15_000,
} = {}) {
  async function call(path, params, accessToken) {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        body.set(key, String(value));
      }
    }
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: body.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new WithingsError(response.status, `Withings HTTP ${response.status} on ${path}`);
    }
    const json = await response.json();
    if (json?.status !== 0) {
      const status = Number(json?.status);
      // The error text never carries a token: safe to keep in the message.
      throw new WithingsError(status, `Withings status ${status} on ${path}: ${json?.error ?? ''}`);
    }
    return json.body ?? {};
  }

  // Follow the `more` / `offset` pagination of the listing calls.
  async function paged(path, params, accessToken, listKey) {
    const items = [];
    let offset;
    let last = {};
    for (let page = 0; page < MAX_PAGES; page += 1) {
      last = await call(path, { ...params, offset }, accessToken);
      items.push(...(last[listKey] ?? []));
      if (!last.more || last.offset === undefined) {
        break;
      }
      offset = last.offset;
    }
    return { items, last };
  }

  function tokens(body) {
    return {
      userid: body.userid === undefined ? '' : String(body.userid),
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_in: Number(body.expires_in) || 10800,
      scope: body.scope ?? '',
    };
  }

  return {
    /** Exchange the authorization code (valid 30 seconds) for tokens. */
    async requestToken({ clientId, clientSecret, code, redirectUri }) {
      const body = await call('/v2/oauth2', {
        action: 'requesttoken',
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      });
      return tokens(body);
    },

    /** New tokens from the refresh token. The old refresh token dies with it. */
    async refreshToken({ clientId, clientSecret, refreshToken }) {
      const body = await call('/v2/oauth2', {
        action: 'requesttoken',
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      });
      return tokens(body);
    },

    /** The Withings devices of the account (scales, monitors, watches...). */
    async getDevices(accessToken) {
      const body = await call('/v2/user', { action: 'getdevice' }, accessToken);
      return body.devices ?? [];
    },

    /**
     * Measure groups, either modified since `lastupdate` or taken since
     * `startdate` (unix seconds).
     */
    async getMeasures(accessToken, { meastypes, lastupdate, startdate }) {
      const { items, last } = await paged(
        '/measure',
        {
          action: 'getmeas',
          meastypes: meastypes.join(','),
          category: 1, // real measures, not the user objectives
          lastupdate,
          startdate,
        },
        accessToken,
        'measuregrps',
      );
      return { groups: items, updatetime: last.updatetime, timezone: last.timezone };
    },

    /** Daily activity summaries between two `YYYY-MM-DD` dates. */
    async getActivity(accessToken, { startdateymd, enddateymd }) {
      const { items } = await paged(
        '/v2/measure',
        {
          action: 'getactivity',
          startdateymd,
          enddateymd,
          data_fields: 'steps,distance,elevation,calories,totalcalories',
        },
        accessToken,
        'activities',
      );
      return items;
    },

    /** Sleep summaries (one per night) between two `YYYY-MM-DD` dates. */
    async getSleepSummary(accessToken, { startdateymd, enddateymd }) {
      const { items } = await paged(
        '/v2/sleep',
        {
          action: 'getsummary',
          startdateymd,
          enddateymd,
          data_fields:
            'total_sleep_time,deepsleepduration,lightsleepduration,remsleepduration,' +
            'sleep_score,wakeupcount,hr_average',
        },
        accessToken,
        'series',
      );
      return items;
    },

    /** Ask Withings to POST to `callbackurl` when data of `appli` changes. */
    async subscribe(accessToken, { callbackurl, appli, comment }) {
      await call('/notify', { action: 'subscribe', callbackurl, appli, comment }, accessToken);
    },

    async revoke(accessToken, { callbackurl, appli }) {
      await call('/notify', { action: 'revoke', callbackurl, appli }, accessToken);
    },

    async listSubscriptions(accessToken) {
      const body = await call('/notify', { action: 'list' }, accessToken);
      return body.profiles ?? [];
    },
  };
}
