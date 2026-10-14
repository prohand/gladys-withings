// -----------------------------------------------------------------------------
// OAuth2 with Withings, relayed by Gladys.
//
// The Configuration screen shows a "Connect" button (manifest field of type
// `oauth2`): Gladys asks us for the authorization URL, sends the user there,
// and hands us back the `code` Withings returned. We exchange it for tokens
// and keep them in the Gladys configuration, outside the `config_schema`.
//
// Two Withings rules shape this module:
//   - the authorization code lives 30 seconds: it is exchanged at once;
//   - the refresh token ROTATES: every refresh returns a new one and kills the
//     old one. Two refreshes running together would leave us with a dead
//     token, so refreshes are single-flight, and the new pair is saved before
//     it is used.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { WITHINGS_AUTHORIZE_URL, WITHINGS_SCOPES, WithingsError } from './client.js';

const logger = createLogger({ name: 'withings-auth' });

// Refresh a little before the expiry, so a call never leaves with a token
// that dies on the way.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
// How long an authorization started from the Connect button stays valid.
const STATE_TTL_MS = 15 * 60 * 1000;

export class NotLinkedError extends Error {
  constructor(message = 'No Withings account connected') {
    super(message);
    this.name = 'NotLinkedError';
  }
}

/** The Withings authorization URL the Connect button opens. */
export function buildAuthorizeUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: WITHINGS_SCOPES.join(','),
    redirect_uri: redirectUri,
    state,
  });
  return `${WITHINGS_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * The anti-CSRF `state` values of the authorizations in progress: one per
 * click on Connect, used once, forgotten after a quarter of an hour.
 */
export function createOAuthStates({ now = Date.now } = {}) {
  const pending = new Map();
  return {
    create(redirectUri) {
      for (const [state, entry] of pending) {
        if (entry.expiresAt < now()) pending.delete(state);
      }
      const state = randomUUID();
      pending.set(state, { redirectUri, expiresAt: now() + STATE_TTL_MS });
      return state;
    },
    /** True once for a state we issued and that has not expired. */
    consume(state) {
      const entry = pending.get(state);
      pending.delete(state);
      return Boolean(entry && entry.expiresAt >= now());
    },
  };
}

/**
 * Keeps the tokens, refreshes them, saves them in Gladys.
 *
 * The in-memory copy is the source of truth while the integration runs: the
 * configuration echo of our own `setConfig` may arrive late, and must never
 * put back a refresh token Withings already killed.
 */
export function createTokenManager({ gladys, client, getAppConfig, now = Date.now }) {
  let tokens = { access_token: '', refresh_token: '', token_expires_at: 0, withings_userid: '' };
  let refreshing = null;
  let needsReconnect = false;

  async function save(received) {
    tokens = {
      access_token: received.access_token,
      refresh_token: received.refresh_token,
      token_expires_at: now() + received.expires_in * 1000,
      withings_userid: received.userid || tokens.withings_userid,
      token_scope: received.scope,
    };
    needsReconnect = false;
    try {
      await gladys.setConfig(tokens);
    } catch (err) {
      // Kept in memory: the integration keeps working until it restarts.
      logger.error('Could not save the Withings tokens in Gladys', err);
    }
  }

  async function refresh() {
    const config = getAppConfig();
    logger.debug('Refreshing the Withings access token');
    try {
      await save(
        await client.refreshToken({
          clientId: config.client_id,
          clientSecret: config.client_secret,
          refreshToken: tokens.refresh_token,
        }),
      );
    } catch (err) {
      // A Withings refusal (bad client secret, revoked or dead refresh
      // token) cannot heal by itself; a network error can.
      if (err instanceof WithingsError && !err.isRateLimited) {
        needsReconnect = true;
      }
      throw err;
    }
  }

  return {
    /** Load the tokens stored in the Gladys configuration (on connection). */
    load(config) {
      tokens = {
        access_token: config.access_token,
        refresh_token: config.refresh_token,
        token_expires_at: config.token_expires_at,
        withings_userid: config.withings_userid,
        token_scope: config.token_scope,
      };
      needsReconnect = false;
    },

    isLinked() {
      return Boolean(tokens.refresh_token);
    },

    needsReconnect() {
      return needsReconnect;
    },

    userId() {
      return tokens.withings_userid;
    },

    /** Exchange the code of the OAuth callback, then save the tokens. */
    async exchangeCode(code, redirectUri) {
      const config = getAppConfig();
      const received = await client.requestToken({
        clientId: config.client_id,
        clientSecret: config.client_secret,
        code,
        redirectUri,
      });
      await save(received);
      logger.info(`Withings account ${received.userid} connected`);
      return received.userid;
    },

    /** A valid access token, refreshed when needed (single-flight). */
    async getAccessToken() {
      if (!tokens.refresh_token) {
        throw new NotLinkedError();
      }
      if (tokens.access_token && tokens.token_expires_at - EXPIRY_MARGIN_MS > now()) {
        return tokens.access_token;
      }
      if (!refreshing) {
        refreshing = refresh().finally(() => {
          refreshing = null;
        });
      }
      await refreshing;
      return tokens.access_token;
    },

    /** Force the next call to refresh (Withings refused the access token). */
    expireAccessToken() {
      tokens.token_expires_at = 0;
    },

    /** Forget the account: the user will have to click Connect again. */
    async clear() {
      tokens = {
        access_token: '',
        refresh_token: '',
        token_expires_at: 0,
        withings_userid: '',
        token_scope: '',
      };
      needsReconnect = false;
      await gladys.setConfig(tokens);
    },
  };
}
