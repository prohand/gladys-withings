// -----------------------------------------------------------------------------
// A fake Withings API, as a `fetch` function: no network in the tests.
//
// It answers the calls of src/withings/client.js from the data the test puts
// in it, and records every call (path, parameters, bearer token) so the tests
// can assert on what the integration asked.
// -----------------------------------------------------------------------------

export function createFakeWithings({
  devices = [],
  groups = [],
  activities = [],
  nights = [],
  userid = '4242',
} = {}) {
  const fake = {
    devices,
    groups,
    activities,
    nights,
    userid,
    updatetime: 1_700_000_000,
    calls: [],
    subscriptions: [],
    tokenCount: 0,
    // Set to a Withings status to make the next calls of an action fail.
    failures: {},
    // Access tokens Withings considers valid (the latest issued).
    validAccessTokens: new Set(),
    refreshTokens: new Set(),

    callsOf(action) {
      return this.calls.filter((call) => call.params.action === action);
    },

    issueTokens() {
      this.tokenCount += 1;
      const access = `access-${this.tokenCount}`;
      const refresh = `refresh-${this.tokenCount}`;
      this.validAccessTokens = new Set([access]);
      this.refreshTokens = new Set([refresh]);
      return {
        userid: Number(this.userid),
        access_token: access,
        refresh_token: refresh,
        expires_in: 10800,
        scope: 'user.info,user.metrics,user.activity,user.sleepevents',
        token_type: 'Bearer',
      };
    },
  };

  function answer(status, body, error) {
    return {
      ok: true,
      status: 200,
      async json() {
        return status === 0 ? { status, body } : { status, error };
      },
    };
  }

  fake.fetch = async (url, { body, headers }) => {
    const path = new URL(url).pathname;
    const params = Object.fromEntries(new URLSearchParams(body));
    const token = headers.Authorization?.replace('Bearer ', '');
    fake.calls.push({ path, params, token });

    const failure = fake.failures[params.action];
    if (failure !== undefined) {
      return answer(failure, null, `forced failure ${failure}`);
    }

    if (path === '/v2/oauth2') {
      if (params.client_secret !== 'secret') return answer(503, null, 'Invalid Params');
      if (params.grant_type === 'authorization_code') {
        if (params.code !== 'good-code') return answer(503, null, 'Invalid Params: code');
        return answer(0, fake.issueTokens());
      }
      if (!fake.refreshTokens.has(params.refresh_token)) {
        return answer(503, null, 'Invalid Params: invalid refresh_token');
      }
      return answer(0, fake.issueTokens());
    }

    if (!fake.validAccessTokens.has(token)) {
      return answer(401, null, 'invalid_token');
    }

    switch (`${path} ${params.action}`) {
      case '/v2/user getdevice':
        return answer(0, { devices: fake.devices });
      case '/measure getmeas': {
        const since = Number(params.lastupdate ?? 0);
        const start = Number(params.startdate ?? 0);
        const measuregrps = fake.groups.filter(
          (group) => (group.modified ?? group.date) > since && group.date >= start,
        );
        return answer(0, { updatetime: fake.updatetime, timezone: 'Europe/Paris', measuregrps });
      }
      case '/v2/measure getactivity':
        return answer(0, { activities: fake.activities, more: false, offset: 0 });
      case '/v2/sleep getsummary':
        return answer(0, { series: fake.nights, more: false, offset: 0 });
      case '/notify subscribe':
        fake.subscriptions.push({ callbackurl: params.callbackurl, appli: Number(params.appli) });
        return answer(0, {});
      case '/notify revoke':
        fake.subscriptions = fake.subscriptions.filter(
          (s) => !(s.callbackurl === params.callbackurl && s.appli === Number(params.appli)),
        );
        return answer(0, {});
      case '/notify list':
        return answer(0, { profiles: fake.subscriptions });
      default:
        return answer(2554, null, 'Unknown action');
    }
  };

  return fake;
}

/** A measure group the way getmeas answers it. */
export function group({ grpid, date, measures, modified }) {
  return {
    grpid,
    attrib: 0,
    date,
    created: date,
    modified: modified ?? date,
    category: 1,
    deviceid: 'scale-1',
    measures: Object.entries(measures).map(([type, [value, unit]]) => ({
      type: Number(type),
      value,
      unit,
    })),
  };
}
