// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ACTION_KEY,
  ANNOUNCED_TRIGGER_KEY,
  ENDED_TRIGGER_KEY,
  SCENE_ACTION_KEY,
  SOON_TRIGGER_KEY,
} from '../src/app.js';
import { DEFAULT_CONFIG, LANGUAGES, LEADS } from '../src/config.js';
import { directionIds } from '../src/devices.js';
import { WIDGET_KEY } from '../src/widgets.js';
import { BODY_21, MINUTE, ROWS_225, createWorld, withRows } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const field = (key) => manifest.config_schema.find((f) => f.key === key);

test('identity: name, image, cover, transport, energy category, Great Britain', () => {
  assert.equal(manifest.name, 'NESO Demand Flexibility');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-demand-flexibility:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-demand-flexibility/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.categories, ['energy']);
  assert.deepEqual(manifest.countries, ['GB']);
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('Gladys >= 5.3.0 (countries)', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  const valued = manifest.config_schema.filter((f) => f.type !== 'section');
  assert.deepEqual(keysOf(valued).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const f of valued) {
    assert.equal(DEFAULT_CONFIG[f.key], f.default, f.key);
  }
  assert.deepEqual(
    field('language').options.map((o) => o.value),
    LANGUAGES,
  );
});

test('section fields are presentational, their links https, NESO named', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
  assert.match(field('intro').description.en, /Not affiliated with NESO/);
  assert.match(field('intro').description.fr, /Sans lien avec NESO/);
});

test('the manifest action has a handler and needs no field', async (t) => {
  assert.deepEqual(keysOf(manifest.actions), [ACTION_KEY]);
  assert.equal(manifest.actions[0].fields, undefined);
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action(ACTION_KEY, {});
  assert.equal(ack.success, true, JSON.stringify(ack.error));
});

test('scene keys and the widget key are the ones of the code', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), [
    ANNOUNCED_TRIGGER_KEY,
    SOON_TRIGGER_KEY,
    ENDED_TRIGGER_KEY,
  ]);
  assert.deepEqual(
    manifest.scene_triggers[1].fields[1].options.map((o) => o.value),
    LEADS,
  );
  assert.deepEqual(keysOf(manifest.scene_actions), [SCENE_ACTION_KEY]);
  assert.deepEqual(keysOf(manifest.scene_actions[0].fields), ['device']);
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  const settings = manifest.widgets[0].settings;
  assert.deepEqual(keysOf(settings), ['device', 'show_upcoming', 'show_last']);
  assert.equal(settings[0].source, 'devices');
});

/** Every key sent is a filter or a variable, every variable is sent with its type. */
function assertMatches(declaredFields, variables, data) {
  const declared = new Set([...keysOf(declaredFields), ...keysOf(variables)]);
  assert.deepEqual(
    Object.keys(data).filter((key) => !declared.has(key)),
    [],
  );
  for (const variable of variables) {
    assert.equal(typeof data[variable.key], variable.type, variable.key);
  }
  for (const filter of declaredFields) {
    assert.ok(filter.key in data, filter.key);
  }
}

test('the triggers and the scene action send what the manifest declares', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.clock.advance(150 * MINUTE); // 15:00: starts soon
  await world.app.tick();
  world.clock.advance(301 * MINUTE); // 20:01: ended
  await world.app.tick();
  world.api.body = withRows(BODY_21, ROWS_225); // announced
  await world.app.tick({ force: true });
  for (const trigger of manifest.scene_triggers) {
    const event = world.fake.sceneEvents.find((e) => e.key === trigger.key);
    assert.ok(event, trigger.key);
    assertMatches(trigger.fields, trigger.variables, event.data);
  }
  const ack = await world.fake.sceneAction(SCENE_ACTION_KEY, {
    device: directionIds(world.gladys, 'down').device,
  });
  assert.equal(ack.success, true, JSON.stringify(ack.error));
  assertMatches([], manifest.scene_actions[0].outputs, ack.data.outputs);
});
