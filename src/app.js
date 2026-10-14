// -----------------------------------------------------------------------------
// The integration: every Gladys handler, wired to the Withings modules.
//
// `createApp(gladys)` registers the handlers on a GladysIntegration (the real
// one in index.js, the fake one of the SDK in the tests) and returns a few
// hooks for the shutdown and the tests. No Withings logic lives here: the API
// is in src/withings/, the devices in src/devices/, the scenes and widgets in
// src/capabilities/.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { hasDeveloperApp, normalizeConfig, userSettingsChanged } from './config.js';
import { localize, pick } from './i18n.js';
import { createStateStore } from './state.js';
import { accountIds } from './devices/account.js';
import { SCENE_ACTIONS } from './capabilities/scenes.js';
import { SCENE_TRIGGERS } from './capabilities/triggers.js';
import { refreshWidgets, relativeTime, WIDGETS } from './capabilities/widgets.js';
import { createWithingsClient } from './withings/client.js';
import {
  buildAuthorizeUrl,
  createOAuthStates,
  createTokenManager,
  NotLinkedError,
} from './withings/auth.js';
import {
  APPLI,
  NOTIFY_WEBHOOK,
  parseNotification,
  registerNotifications,
  unregisterNotifications,
} from './withings/notify.js';
import { createSync } from './withings/sync.js';

const logger = createLogger({ name: 'withings' });

// A burst of notifications (a weigh-in sends weight, then body composition)
// becomes one synchronization.
const NOTIFICATION_DEBOUNCE_MS = 5_000;

const MESSAGES = {
  missingApp: {
    en: 'Fill in the Client ID and the Client secret of your Withings developer app, save, then click Connect.',
    fr: 'Renseignez le Client ID et le Client secret de votre application développeur Withings, enregistrez, puis cliquez sur Connecter.',
    de: 'Trage die Client-ID und das Client-Secret deiner Withings-Entwickler-App ein, speichere und klicke dann auf Verbinden.',
    es: 'Introduzca el Client ID y el Client secret de su aplicación de desarrollador Withings, guarde y luego haga clic en Conectar.',
  },
  notLinked: {
    en: 'Click Connect to link your Withings account.',
    fr: 'Cliquez sur Connecter pour lier votre compte Withings.',
    de: 'Klicke auf Verbinden, um dein Withings-Konto zu verknüpfen.',
    es: 'Haga clic en Conectar para vincular su cuenta Withings.',
  },
  reconnect: {
    en: 'Withings refused the connection (access revoked or app changed): click Connect again.',
    fr: 'Withings a refusé la connexion (accès révoqué ou application modifiée) : cliquez à nouveau sur Connecter.',
    de: 'Withings hat die Verbindung abgelehnt (Zugriff widerrufen oder App geändert): klicke erneut auf Verbinden.',
    es: 'Withings rechazó la conexión (acceso revocado o aplicación modificada): haga clic de nuevo en Conectar.',
  },
  unreachable: {
    en: 'Withings cannot be reached right now: the integration will try again at the next refresh.',
    fr: "Withings est injoignable pour le moment : l'intégration réessaiera au prochain rafraîchissement.",
    de: 'Withings ist gerade nicht erreichbar: die Integration versucht es bei der nächsten Aktualisierung erneut.',
    es: 'Withings no está disponible en este momento: la integración lo intentará de nuevo en la próxima actualización.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Die Initialisierung ist fehlgeschlagen, prüfe die Logs der Integration.',
    es: 'La inicialización falló, revise los registros de la integración.',
  },
};

/**
 * Register every handler on `gladys`.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [deps] injected in the tests
 */
export function createApp(
  gladys,
  {
    client = createWithingsClient(),
    store = createStateStore(),
    now = Date.now,
    timers = { setInterval, clearInterval, setTimeout, clearTimeout },
  } = {},
) {
  let config = normalizeConfig();
  const getConfig = () => config;
  const tokens = createTokenManager({ gladys, client, getAppConfig: getConfig, now });
  const oauthStates = createOAuthStates({ now });
  const sync = createSync({ gladys, client, tokens, store, getConfig, now });

  let loaded = false;
  let refreshTimer = null;
  let notificationTimer = null;
  let notifications = { status: 'unknown' };

  function stopTimers() {
    if (refreshTimer) timers.clearInterval(refreshTimer);
    if (notificationTimer) timers.clearTimeout(notificationTimer);
    refreshTimer = null;
    notificationTimer = null;
  }

  async function setStatus(connected, message) {
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      logger.error('Could not report the connection status', err);
    }
  }

  // A failed synchronization: say why on the Configuration screen and on the
  // badges, keep what was published.
  async function reportFailure(err) {
    if (err instanceof NotLinkedError) {
      await setStatus(false, MESSAGES.notLinked);
      return;
    }
    logger.error('Withings synchronization failed', err);
    const needsReconnect = tokens.needsReconnect() || err.isAuthError;
    await setStatus(false, needsReconnect ? MESSAGES.reconnect : MESSAGES.unreachable);
    await store.update({ lastError: err.message }).catch(() => {});
    await sync.publishTransports(false).catch((e) => logger.debug(e.message));
  }

  async function synchronize(reason) {
    try {
      const result = await sync.run(reason);
      await setStatus(true);
      refreshWidgets(gladys);
      return result;
    } catch (err) {
      await reportFailure(err);
      throw err;
    }
  }

  async function setupNotifications() {
    try {
      notifications = await registerNotifications({ gladys, client, tokens, store, config });
      logger.info(`Withings notifications: ${notifications.status}`);
    } catch (err) {
      notifications = { status: 'error', message: err.message };
      logger.warn(`Could not register the Withings notifications: ${err.message}`);
    }
    refreshWidgets(gladys);
  }

  // (Re)start everything from the current configuration.
  async function start(reason) {
    stopTimers();
    if (!hasDeveloperApp(config)) {
      await setStatus(false, MESSAGES.missingApp);
      return;
    }
    if (!tokens.isLinked()) {
      await setStatus(false, MESSAGES.notLinked);
      return;
    }
    // What is already known goes to the Discovery screen at once, before the
    // network round trips.
    await sync.publishDiscovery(true).catch((err) => logger.error('Discovery failed', err));
    await synchronize(reason).catch(() => {});
    await setupNotifications();
    refreshTimer = timers.setInterval(
      () => synchronize('timer').catch(() => {}),
      config.refresh_interval * 60 * 1000,
    );
  }

  function scheduleSync(reason) {
    if (notificationTimer) timers.clearTimeout(notificationTimer);
    notificationTimer = timers.setTimeout(() => {
      notificationTimer = null;
      return synchronize(reason).catch(() => {});
    }, NOTIFICATION_DEBOUNCE_MS);
  }

  // "In bed" / "out of bed" exist only as notifications: they set the
  // presence feature and fire the scene trigger, once per change.
  async function bedChanged(inBed) {
    const state = store.get();
    if (!state.userid) return;
    const ids = accountIds(gladys, state.userid);
    try {
      await gladys.publishState(ids.feature('in_bed'), inBed);
    } catch (err) {
      logger.error('Could not publish the in-bed state', err);
    }
    if (state.inBed === inBed) return;
    await store.update({ inBed });
    try {
      await gladys.publishSceneEvent(inBed ? SCENE_TRIGGERS.BED_IN : SCENE_TRIGGERS.BED_OUT, {
        device: ids.device,
      });
    } catch (err) {
      logger.error('Bed scene event refused', err);
    }
  }

  // --- Discovery -------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await sync.publishDiscovery(true);
    if (tokens.isLinked()) {
      synchronize('scan').catch(() => {});
    }
  });

  // A device created after the first synchronization missed its values (Gladys
  // drops the states of an unknown feature): send the known ones again.
  gladys.onDeviceCreated(async () => {
    await sync.republishLatest();
  });

  // --- OAuth2: the Connect button of the Configuration screen ----------------
  gladys.onOAuthAuthorizeUrl(async (_key, redirectUri) => {
    if (!hasDeveloperApp(config)) {
      throw new Error(MESSAGES.missingApp.en);
    }
    // Withings only redirects to the callback URLs declared in the app: log
    // the one Gladys uses, "Test the connection" shows it too.
    logger.info(`Callback URL to declare in your Withings app: ${redirectUri}`);
    await store.update({ redirectUri });
    return buildAuthorizeUrl({
      clientId: config.client_id,
      redirectUri,
      state: oauthStates.create(redirectUri),
    });
  });

  gladys.onOAuthCallback(async (_key, { code, state, redirectUri }) => {
    if (!oauthStates.consume(state)) {
      throw new Error('Unknown or expired authorization: click Connect again.');
    }
    if (!code) {
      throw new Error('Withings returned no authorization code.');
    }
    // The code lives 30 seconds: exchanged before anything else.
    const userid = await tokens.exchangeCode(code, redirectUri);
    if (store.get().userid !== userid) {
      await store.reset(userid);
    }
    await setStatus(true);
    // The first synchronization reads a year of measures: not in the ack.
    start('account connected').catch((err) => logger.error('Start after Connect failed', err));
  });

  // --- Notifications relayed by Gladys Plus ----------------------------------
  gladys.onWebhook(NOTIFY_WEBHOOK, async (request) => {
    const notification = parseNotification(request);
    if (!notification.appli) {
      // The call Withings makes to check the URL when subscribing.
      logger.debug('Notification without data (URL check)');
      return;
    }
    const userid = tokens.userId();
    if (notification.userid && userid && notification.userid !== userid) {
      logger.warn('Notification for another Withings account ignored');
      return;
    }
    logger.info(`Withings notification (appli ${notification.appli})`);
    if (notification.appli === APPLI.BED_IN || notification.appli === APPLI.BED_OUT) {
      await bedChanged(notification.appli === APPLI.BED_IN ? 1 : 0);
      return;
    }
    scheduleSync('notification');
  });

  // Gladys Plus linked, unlinked or its key changed: register the new URL.
  gladys.onWebhookUpdated(async () => {
    if (tokens.isLinked()) {
      await setupNotifications();
    }
  });

  // --- Manifest actions (Configuration screen buttons) -----------------------
  gladys.onAction('test_connection', async () => {
    const callback = store.get().redirectUri;
    const callbackLine = (language) =>
      callback
        ? pick(language, {
            en: ` Callback URL declared to Withings: ${callback}`,
            fr: ` URL de rappel déclarée à Withings : ${callback}`,
            de: ` An Withings gemeldete Callback-URL: ${callback}`,
            es: ` URL de retorno declarada a Withings: ${callback}`,
          })
        : '';
    if (!hasDeveloperApp(config)) {
      return MESSAGES.missingApp;
    }
    if (!tokens.isLinked()) {
      return localize((l) => `${pick(l, MESSAGES.notLinked)}${callbackLine(l)}`);
    }
    try {
      const token = await tokens.getAccessToken();
      const devices = await client.getDevices(token);
      const state = store.get();
      const models = devices.map((device) => device.model ?? device.type).join(', ');
      const lastSync = state.lastSync;
      return localize((l) => {
        const notificationText = pick(
          l,
          {
            registered: {
              en: 'active',
              fr: 'actives',
              de: 'aktiv',
              es: 'activas',
            },
            unavailable: {
              en: 'off (no Gladys Plus linked)',
              fr: 'inactives (pas de Gladys Plus lié)',
              de: 'aus (kein Gladys Plus verknüpft)',
              es: 'desactivadas (sin Gladys Plus vinculado)',
            },
            disabled: {
              en: 'disabled in the configuration',
              fr: 'désactivées dans la configuration',
              de: 'in der Konfiguration deaktiviert',
              es: 'desactivadas en la configuración',
            },
          }[notifications.status] ?? {
            en: `unknown (${notifications.message ?? 'not registered yet'})`,
            fr: `inconnues (${notifications.message ?? 'pas encore enregistrées'})`,
            de: `unbekannt (${notifications.message ?? 'noch nicht registriert'})`,
            es: `desconocidas (${notifications.message ?? 'aún no registradas'})`,
          },
        );
        return pick(l, {
          en: `Connected to Withings account ${tokens.userId()}: ${devices.length} device(s)${models ? ` (${models})` : ''}. Last synchronization: ${relativeTime(lastSync, l, now())}. Real-time notifications: ${notificationText}.`,
          fr: `Connecté au compte Withings ${tokens.userId()} : ${devices.length} appareil(s)${models ? ` (${models})` : ''}. Dernière synchronisation : ${relativeTime(lastSync, l, now())}. Notifications temps réel : ${notificationText}.`,
          de: `Mit dem Withings-Konto ${tokens.userId()} verbunden: ${devices.length} Gerät(e)${models ? ` (${models})` : ''}. Letzte Synchronisierung: ${relativeTime(lastSync, l, now())}. Echtzeit-Benachrichtigungen: ${notificationText}.`,
          es: `Conectado a la cuenta Withings ${tokens.userId()}: ${devices.length} dispositivo(s)${models ? ` (${models})` : ''}. Última sincronización: ${relativeTime(lastSync, l, now())}. Notificaciones en tiempo real: ${notificationText}.`,
        });
      });
    } catch (err) {
      await reportFailure(err);
      return localize(
        (l) =>
          `${pick(l, tokens.needsReconnect() ? MESSAGES.reconnect : MESSAGES.unreachable)} (${err.message})`,
      );
    }
  });

  gladys.onAction('sync_now', async () => {
    if (!tokens.isLinked()) {
      return MESSAGES.notLinked;
    }
    const { newMeasurements } = await synchronize('action');
    return localize((l) =>
      pick(l, {
        en: `Synchronized: ${newMeasurements} new measurement(s).`,
        fr: `Synchronisé : ${newMeasurements} nouvelle(s) mesure(s).`,
        de: `Synchronisiert: ${newMeasurements} neue Messung(en).`,
        es: `Sincronizado: ${newMeasurements} medición(es) nueva(s).`,
      }),
    );
  });

  gladys.onAction('unlink_account', async () => {
    stopTimers();
    if (tokens.isLinked()) {
      await unregisterNotifications({ client, tokens, store });
    }
    await tokens.clear();
    await store.reset('');
    notifications = { status: 'unknown' };
    await sync.publishDiscovery(true);
    await setStatus(false, MESSAGES.notLinked);
    refreshWidgets(gladys);
    return localize((l) =>
      pick(l, {
        en: 'Withings account disconnected. The devices stay in Gladys with their history.',
        fr: 'Compte Withings déconnecté. Les appareils restent dans Gladys avec leur historique.',
        de: 'Withings-Konto getrennt. Die Geräte bleiben mit ihrem Verlauf in Gladys.',
        es: 'Cuenta Withings desconectada. Los dispositivos permanecen en Gladys con su historial.',
      }),
    );
  });

  // --- Scene actions and dashboard widgets (Gladys 5.1+) ---------------------
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler({ sync, store, gladys }, { fields }));
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(gladys, { ...request, store, now: now() }));
    if (typeof widget.action === 'function') {
      gladys.onWidgetAction(key, (actionKey, params, { settings } = {}) =>
        widget.action(gladys, { actionKey, params, settings, sync }),
      );
    }
  }

  // --- Configuration and connection lifecycle --------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    const previous = config;
    config = normalizeConfig(newConfig);
    // Our own token writes come back here too: nothing to restart for them.
    if (userSettingsChanged(previous, config)) {
      logger.info('Configuration changed, restarting the synchronization');
      await start('configuration');
    }
  });

  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      if (!loaded) {
        // Once per process: afterwards the tokens in memory are newer than
        // what a reconnection reads back.
        tokens.load(config);
        await store.load();
        loaded = true;
      }
      await start('connection');
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await setStatus(false, MESSAGES.initFailed);
    }
  });

  gladys.on('disconnected', () => {
    stopTimers();
  });

  return {
    stop: stopTimers,
    getConfig,
    sync,
    tokens,
  };
}
