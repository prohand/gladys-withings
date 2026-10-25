# Withings — Gladys Assistant integration

External integration connecting [Gladys Assistant](https://gladysassistant.com)
to a **Withings** account: weight and body composition, blood pressure, heart
rate, SpO2, temperature, daily activity, sleep, the "in bed" state of a Sleep
Analyzer and the batteries of the devices.

Built on the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [English](./docs/en.md) · [Français](./docs/fr.md) · [Deutsch](./docs/de.md) ·
[Español](./docs/es.md).

## What it does

| Gladys device                  | Features                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| **Withings health** (account)  | Every measure the account has, today's activity, last night's sleep, in bed (Sleep Analyzer) |
| One per battery-powered device | Battery low                                                                                  |

It requires Gladys 5.3+, and also extends the scene editor and the dashboard
(`src/capabilities/`):

| Capability     | Keys                                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| Scene triggers | `new_measurement`, `bed_in`, `bed_out`, `sleep_summary_ready`, `steps_goal_reached`  |
| Scene actions  | `refresh_data`, `get_last_measure`                                                   |
| Widgets        | `withings_summary` (tiles, status, refresh button), `withings_weight` (weight chart) |

## How it talks to Withings

One transport, declared in the manifest: **cloud** — the
[Withings public API](https://developer.withings.com/api-reference) over
HTTPS. Each device carries a transport badge: `cloud` when the last read
worked, `unreachable` otherwise.

- **OAuth2**: the manifest declares an `oauth2` field; Gladys relays the
  Connect flow (`onOAuthAuthorizeUrl` / `onOAuthCallback`). The user brings
  their own Withings developer app (Client ID + secret). The refresh token
  rotates at every refresh: refreshes are single-flight and the new pair is
  saved with `setConfig` before use (`src/withings/auth.js`).
- **Reads**: `getdevice`, `getmeas` (incremental through `lastupdate`),
  `getactivity`, `sleep getsummary`, on a timer (`refresh_interval`, 30 min by
  default) — `src/withings/sync.js`.
- **Notifications**: the manifest declares a `notify` webhook relayed by
  Gladys Plus. The integration subscribes it at Withings (`notify subscribe`)
  and treats a notification as "read now" (debounced), except the bed in/out
  events of a Sleep Analyzer, which only exist as notifications
  (`src/withings/notify.js`).

## Project structure

```
.
├─ index.js                          # SDK bootstrap: createApp + connect
├─ src/
│  ├─ app.js                         # every Gladys handler, wired to the modules below
│  ├─ config.js                      # DEFAULT_CONFIG (mirrors the manifest) + normalization
│  ├─ i18n.js                        # en / fr / de / es helpers
│  ├─ state.js                       # /data/withings-state.json (cursor, last values...)
│  ├─ withings/
│  │  ├─ client.js                   # Withings API (fetch injectable)
│  │  ├─ auth.js                     # OAuth2: authorize URL, states, token manager
│  │  ├─ measures.js                 # Withings measure types -> Gladys features
│  │  ├─ sync.js                     # one synchronization: devices, states, scene events
│  │  ├─ notify.js                   # Gladys Plus notifications (subscribe, parse)
│  │  └─ dates.js
│  ├─ devices/                       # account device, hardware devices, discovery
│  └─ capabilities/                  # scene triggers / actions, widgets (Gladys 5.1+)
├─ docs/{en,fr,de,es}.md             # user documentation (re-hosted by Gladys)
├─ test/                             # node --test, fake Gladys (SDK) + fake Withings API
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ .github/                          # CI, release, build, GitHub releases, Dependabot
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="withings" \
WITHINGS_STATE_FILE="./data/withings-state.json" \
LOG_LEVEL=debug \
npm start
```

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test, no network
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI runs the first three on Node 22 and 24; on pull requests it also runs
the store checks and builds the Docker image.

## Release

1. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. **Actions → Release → Run workflow**, pick `patch`, `minor` or `major`.

The workflow bumps `package.json`, the manifest `version` and `docker_image`,
moves the changelog section, tags `vX.Y.Z`, builds the `linux/amd64` +
`linux/arm64` image to `ghcr.io/prohand/gladys-withings` and publishes the
GitHub Release.

Before the first release, add the GitHub topic `gladys-assistant-integration`
to the repository, make the package public on ghcr.io once it exists, and
turn on **Private vulnerability reporting** ([`SECURITY.md`](SECURITY.md)).

## License

Apache-2.0
