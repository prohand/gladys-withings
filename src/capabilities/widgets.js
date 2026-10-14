// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+).
//
// The content is declarative: the core renders it with its theme and dark
// mode. Tiles and charts are bound to the account device features
// (`device_feature`), so they follow the published states live; the status
// rows are computed here and refreshed by `requestWidgetRefresh` after every
// synchronization.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { accountFeatureKeys, accountIds } from '../devices/account.js';
import { batteryLowState, hasBattery } from '../devices/hardware.js';
import { localize, pick } from '../i18n.js';

const logger = createLogger({ name: 'widgets' });

export const SUMMARY_WIDGET = 'withings_summary';
export const WEIGHT_WIDGET = 'withings_weight';

const ACTIONS = { REFRESH: 'refresh' };

// The tiles of the summary, in order of preference (at most 4 shown).
const SUMMARY_TILES = [
  { key: 'weight', icon: 'user', label: { en: 'Weight', fr: 'Poids', de: 'Gewicht', es: 'Peso' } },
  {
    key: 'steps',
    icon: 'activity',
    label: { en: 'Steps', fr: 'Pas', de: 'Schritte', es: 'Pasos' },
  },
  {
    key: 'sleep_duration',
    icon: 'moon',
    label: { en: 'Sleep', fr: 'Sommeil', de: 'Schlaf', es: 'Sueño' },
  },
  {
    key: 'systolic',
    icon: 'heart',
    label: { en: 'Systolic', fr: 'Systolique', de: 'Systolisch', es: 'Sistólica' },
  },
  {
    key: 'heart_rate',
    icon: 'heart',
    label: { en: 'Heart rate', fr: 'Pouls', de: 'Puls', es: 'Pulso' },
  },
  {
    key: 'body_temperature',
    icon: 'thermometer',
    label: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  },
];
const MAX_TILES = 4;

const INTERVALS = new Set(['last-week', 'last-month', 'last-three-months', 'last-year']);
const DEFAULT_INTERVAL = 'last-month';

const NOT_CONNECTED = {
  en: 'Connect your Withings account in the configuration of the integration.',
  fr: "Connectez votre compte Withings dans la configuration de l'intégration.",
  de: 'Verbinde dein Withings-Konto in der Konfiguration der Integration.',
  es: 'Conecte su cuenta Withings en la configuración de la integración.',
};

/** "3 hours ago", in the reader's language. */
export function relativeTime(isoOrSeconds, language, now = Date.now()) {
  const ms = typeof isoOrSeconds === 'number' ? isoOrSeconds * 1000 : Date.parse(isoOrSeconds);
  if (!Number.isFinite(ms) || ms <= 0) {
    return pick(language, { en: 'never', fr: 'jamais', de: 'nie', es: 'nunca' });
  }
  const seconds = Math.round((ms - now) / 1000);
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  let format;
  try {
    format = new Intl.RelativeTimeFormat(language || 'en', { numeric: 'auto' });
  } catch {
    format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  }
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return format.format(0, 'minute');
}

function lastMeasurementDate(state) {
  const dates = Object.entries(state.latest ?? {})
    .filter(([key]) => !key.includes('sleep') && key !== 'wakeup_count')
    .map(([, entry]) => Number(entry.date))
    .filter(Number.isFinite);
  return dates.length ? Math.max(...dates) : 0;
}

function statusRows(state, language, now) {
  const lowBatteries = (state.devices ?? [])
    .filter((device) => hasBattery(device) && batteryLowState(device) === 1)
    .map((device) => device.model ?? device.type);
  const notifications = Boolean(state.webhookUrl);
  return [
    {
      label: localize((l) =>
        pick(l, {
          en: 'Last measurement',
          fr: 'Dernière mesure',
          de: 'Letzte Messung',
          es: 'Última medición',
        }),
      ),
      icon: 'clock',
      value: relativeTime(lastMeasurementDate(state), language, now),
      color: WIDGET_COLORS.NEUTRAL,
    },
    {
      label: localize((l) =>
        pick(l, {
          en: 'Last synchronization',
          fr: 'Dernière synchronisation',
          de: 'Letzte Synchronisierung',
          es: 'Última sincronización',
        }),
      ),
      icon: 'refresh-cw',
      value: relativeTime(state.lastSync, language, now),
      color: state.lastError ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
    },
    {
      label: localize((l) =>
        pick(l, {
          en: 'Real-time notifications',
          fr: 'Notifications temps réel',
          de: 'Echtzeit-Benachrichtigungen',
          es: 'Notificaciones en tiempo real',
        }),
      ),
      icon: 'bell',
      value: notifications
        ? pick(language, { en: 'Active', fr: 'Actives', de: 'Aktiv', es: 'Activas' })
        : pick(language, { en: 'Off', fr: 'Désactivées', de: 'Aus', es: 'Desactivadas' }),
      color: notifications ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
    {
      label: localize((l) =>
        pick(l, { en: 'Batteries', fr: 'Piles', de: 'Batterien', es: 'Pilas' }),
      ),
      icon: 'battery',
      value: lowBatteries.length
        ? `${pick(language, { en: 'Low', fr: 'Faibles', de: 'Schwach', es: 'Bajas' })}: ${lowBatteries.join(', ')}`.slice(
            0,
            40,
          )
        : 'OK',
      color: lowBatteries.length ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
    },
  ];
}

export const WIDGETS = {
  [SUMMARY_WIDGET]: {
    async get(gladys, { store, language, now = Date.now() }) {
      const state = store.get();
      if (!state.userid) {
        return { ttl_seconds: 300, components: [{ type: 'text', text: NOT_CONNECTED }] };
      }
      const ids = accountIds(gladys, state.userid);
      const features = new Set(accountFeatureKeys(state));
      const tiles = SUMMARY_TILES.filter((tile) => features.has(tile.key))
        .slice(0, MAX_TILES)
        .map((tile) => ({
          type: 'value',
          label: tile.label,
          icon: tile.icon,
          device_feature: ids.feature(tile.key),
        }));
      return {
        // The rows change with each synchronization, which nudges the widget:
        // the TTL only keeps "3 minutes ago" from going stale.
        ttl_seconds: 600,
        components: [
          ...tiles,
          { type: 'status', items: statusRows(state, language, now) },
          {
            type: 'button',
            label: localize((l) =>
              pick(l, { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' }),
            ),
            icon: 'refresh-cw',
            style: 'secondary',
            action: { key: ACTIONS.REFRESH },
          },
        ],
      };
    },

    async action(gladys, { actionKey, sync }) {
      logger.info(`onWidgetAction <- ${SUMMARY_WIDGET}.${actionKey}`);
      if (actionKey !== ACTIONS.REFRESH) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      const { newMeasurements } = await sync.run('widget');
      return localize((l) =>
        pick(l, {
          en: `Withings data refreshed (${newMeasurements} new measurement(s)).`,
          fr: `Données Withings actualisées (${newMeasurements} nouvelle(s) mesure(s)).`,
          de: `Withings-Daten aktualisiert (${newMeasurements} neue Messung(en)).`,
          es: `Datos de Withings actualizados (${newMeasurements} medición(es) nueva(s)).`,
        }),
      );
    },
  },

  [WEIGHT_WIDGET]: {
    async get(gladys, { store, settings = {} }) {
      const state = store.get();
      if (!state.userid) {
        return { ttl_seconds: 300, components: [{ type: 'text', text: NOT_CONNECTED }] };
      }
      if (!accountFeatureKeys(state).includes('weight')) {
        return {
          ttl_seconds: 3600,
          components: [
            {
              type: 'text',
              text: {
                en: 'No weight measured on this Withings account yet.',
                fr: 'Aucun poids mesuré sur ce compte Withings pour le moment.',
                de: 'Auf diesem Withings-Konto wurde noch kein Gewicht gemessen.',
                es: 'Todavía no hay ningún peso medido en esta cuenta Withings.',
              },
            },
          ],
        };
      }
      const weight = accountIds(gladys, state.userid).feature('weight');
      const interval = INTERVALS.has(settings.interval) ? settings.interval : DEFAULT_INTERVAL;
      return {
        // Everything here is bound to the feature: live, nothing to refresh.
        ttl_seconds: 3600,
        components: [
          {
            type: 'value',
            label: { en: 'Weight (kg)', fr: 'Poids (kg)', de: 'Gewicht (kg)', es: 'Peso (kg)' },
            icon: 'user',
            device_feature: weight,
          },
          { type: 'chart', chart_type: 'line', device_features: [weight], interval },
        ],
      };
    },
  },
};

/** Ask the core to re-pull every widget now (after a synchronization). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
