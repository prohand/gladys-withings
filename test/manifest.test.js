// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest, but nothing there can know which
// handlers the code registers, nor that every text exists in the four
// languages of the integration: these tests keep both sides in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { SCENE_ACTIONS } from '../src/capabilities/scenes.js';
import { SCENE_TRIGGERS } from '../src/capabilities/triggers.js';
import { WIDGETS } from '../src/capabilities/widgets.js';
import { SLEEP_FEATURES } from '../src/devices/account.js';
import { MEASURES, MEASUREMENT_KINDS } from '../src/withings/measures.js';
import { NOTIFY_WEBHOOK } from '../src/withings/notify.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const sceneTriggers = (key) => manifest.scene_triggers.find((t) => t.key === key);
const sceneAction = (key) => manifest.scene_actions.find((a) => a.key === key);

// Every list of form fields the manifest declares (same field grammar).
const allFields = [
  ...manifest.config_schema,
  ...[...manifest.actions, ...manifest.scene_triggers, ...manifest.scene_actions].flatMap(
    (item) => item.fields ?? [],
  ),
  ...manifest.widgets.flatMap((widget) => widget.settings ?? []),
];

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

test('every manifest action is registered in src/app.js', () => {
  for (const key of keysOf(manifest.actions)) {
    assert.match(appSource, new RegExp(`onAction\\('${key}'`), `action "${key}" has no handler`);
  }
});

test('the notify webhook is the one the code handles', () => {
  assert.deepEqual(keysOf(manifest.webhooks), [NOTIFY_WEBHOOK]);
  assert.match(appSource, /onWebhook\(NOTIFY_WEBHOOK/);
});

test('scene actions, widgets and scene triggers match the code, both ways', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(SCENE_TRIGGERS).sort());
});

test('the new_measurement trigger exposes every measure and filters on every kind', () => {
  const trigger = sceneTriggers(SCENE_TRIGGERS.NEW_MEASUREMENT);
  const variables = keysOf(trigger.variables);
  for (const measure of MEASURES) {
    assert.ok(variables.includes(measure.key), `variable "${measure.key}" missing`);
  }
  const kinds = trigger.fields.find((field) => field.key === 'kind').options.map((o) => o.value);
  assert.deepEqual(kinds.sort(), Object.values(MEASUREMENT_KINDS).sort());
});

test('get_last_measure offers every measure and the sleep values', () => {
  const options = sceneAction('get_last_measure')
    .fields.find((field) => field.key === 'measure')
    .options.map((option) => option.value);
  for (const key of [...MEASURES.map((m) => m.key), ...SLEEP_FEATURES.map((f) => f.key)]) {
    assert.ok(options.includes(key), `option "${key}" missing`);
  }
});

test('every text exists in English, French, German and Spanish', () => {
  const missing = [];
  (function walk(node, path) {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`));
    } else if (node && typeof node === 'object') {
      if (typeof node.en === 'string') {
        for (const language of LANGUAGES) {
          if (typeof node[language] !== 'string' || node[language].trim() === '') {
            missing.push(`${path}.${language}`);
          }
        }
        return;
      }
      for (const [key, child] of Object.entries(node)) walk(child, `${path}.${key}`);
    }
  })(manifest, 'manifest');
  assert.deepEqual(missing, []);
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [language, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${language} has ${text.length} characters`,
    );
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-withings:${pkg.version}`);
});

// The store's controlled vocabulary of catalog shelves (2026-10): an unknown
// key is only dropped with a warning there, so a typo would silently cost a shelf.
const CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
  'transport',
  'vehicles',
  'servers',
  'leisure',
];

test('capability fields and categories are declared with a Gladys that knows them', () => {
  const [major, minor] = minGladysVersion();
  assert.ok(major > 5 || (major === 5 && minor >= 1), 'widgets and scenes need Gladys >= 5.1.0');
  if (['keywords', 'countries', 'music'].some((field) => field in manifest)) {
    assert.ok(
      major > 5 || (major === 5 && minor >= 3),
      'keywords, countries and music need Gladys >= 5.3.0',
    );
  }
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.equal(new Set(manifest.categories).size, manifest.categories.length);
  for (const category of manifest.categories) {
    assert.ok(CATEGORIES.includes(category), `unknown category "${category}"`);
  }
});

test('the search keywords follow the store rules, and no country restriction', () => {
  const { keywords } = manifest;
  assert.ok(Array.isArray(keywords) && keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, keywords.length, 'keywords must be unique');
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, `keyword "${keyword}" (2 to 30)`);
  }
  // Withings devices are sold everywhere: `countries` would hide the
  // integration from the catalog of every other country.
  assert.equal(manifest.countries, undefined);
});

test('Withings is a cloud service: the transport tag is cloud only', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of "${field.key}"`);
    }
  }
});

test('the account is linked with the OAuth2 Connect button, the secret is a secret', () => {
  const types = Object.fromEntries(manifest.config_schema.map((field) => [field.key, field.type]));
  assert.equal(types.withings_account, 'oauth2');
  assert.equal(types.client_secret, 'secret');
});

test('fields use a type the store accepts, and their rules', () => {
  const types = ['string', 'number', 'boolean', 'select', 'multi_select', 'secret', 'oauth2'];
  for (const field of allFields) {
    assert.match(field.key, /^[a-z0-9_]+$/);
    if (field.type === 'section') {
      assert.equal(field.required, undefined);
      assert.equal(field.default, undefined);
      assert.ok(!(field.key in DEFAULT_CONFIG));
      for (const language of LANGUAGES) {
        assert.ok(field.description[language].length <= 1000, `${field.key}.${language}`);
      }
      for (const link of field.links ?? []) assert.match(link.url, /^https:\/\//);
      continue;
    }
    assert.ok(types.includes(field.type), `field "${field.key}": type "${field.type}"`);
    if (field.placeholder !== undefined) {
      assert.ok(['string', 'number', 'secret'].includes(field.type));
      assert.equal(typeof field.placeholder, 'object');
    }
    if (field.source !== undefined) {
      assert.equal(field.source, 'devices');
      assert.equal(field.options, undefined);
    }
    if (['secret', 'oauth2'].includes(field.type)) {
      assert.equal(field.default, undefined, `field "${field.key}" cannot have a default`);
    }
  }
});

test('widget labels hold 3 to 30 characters', () => {
  for (const widget of manifest.widgets) {
    for (const [language, label] of Object.entries(widget.label)) {
      assert.ok(label.length >= 3 && label.length <= 30, `${widget.key}.${language}`);
    }
  }
});
