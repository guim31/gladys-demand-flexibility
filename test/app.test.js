// The integration against the SDK's fake Gladys and a fake NESO Data Portal
// serving real answers (22/11/2026). The clock is manual.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  ANNOUNCED_TRIGGER_KEY,
  ENDED_TRIGGER_KEY,
  READ_MS,
  SCENE_ACTION_KEY,
  SOON_TRIGGER_KEY,
  TICK_MS,
} from '../src/app.js';
import { KNOWN_RESOURCE_ID } from '../src/api.js';
import { directionIds } from '../src/devices.js';
import { WIDGET_KEY } from '../src/widgets.js';
import {
  BODY_21,
  EMPTY_BODY,
  MINUTE,
  ROWS_225,
  createClock,
  createFakeApi,
  createWorld,
  stateOf,
  withRows,
} from './helpers/world.js';

const keys = (world, key) => world.fake.sceneEvents.filter((e) => e.key === key);

test('the devices: one per kind followed, turn-down by default', async (t) => {
  const world = await createWorld({ created: false });
  t.after(() => world.app.stop());
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => d.name),
    ['Flexibilité DFS (réduire)'],
  );
  const both = await createWorld({ created: false, config: { follow_up: true, language: 'en' } });
  t.after(() => both.app.stop());
  assert.deepEqual(
    both.fake.discoveredDevices.map((d) => d.external_id),
    [directionIds(both.gladys, 'down').device, directionIds(both.gladys, 'up').device],
  );
  assert.ok(both.fake.discoveredDevices.every((d) => d.should_poll === false));
});

test('the states of the next event, then during it, then after it', async (t) => {
  const world = await createWorld({ config: { language: 'en' } });
  t.after(() => world.app.stop());
  assert.equal(stateOf(world, 'down', 'active'), 0);
  assert.equal(stateOf(world, 'down', 'upcoming_count'), 1);
  assert.equal(stateOf(world, 'down', 'next_start'), 'Sat 21/11 16:00');
  assert.equal(stateOf(world, 'down', 'next_end'), '20:00');
  assert.equal(stateOf(world, 'down', 'next_price'), 0);

  // 16:00: the event starts without a new reading.
  world.clock.advance(210 * MINUTE);
  await world.app.tick();
  assert.equal(stateOf(world, 'down', 'active'), 1);
  assert.equal(stateOf(world, 'down', 'upcoming_count'), 0);

  // 20:00: over, nothing else announced.
  world.clock.advance(240 * MINUTE);
  await world.app.tick();
  assert.equal(stateOf(world, 'down', 'active'), 0);
  assert.equal(stateOf(world, 'down', 'next_start'), 'None announced');
  assert.equal(stateOf(world, 'down', 'next_end'), 'None announced');
});

test('a summer time zone shows British local times', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(stateOf(world, 'down', 'next_start'), 'sam. 21/11 16:00');
});

test('triggers: new event, starts soon (each warning once), ended; nothing again after a restart', async (t) => {
  const api = createFakeApi();
  const clock = createClock();
  const world = await createWorld({ api, clock });
  // The first reading records what is already announced: no trigger.
  assert.equal(keys(world, ANNOUNCED_TRIGGER_KEY).length, 0);
  assert.equal(keys(world, ENDED_TRIGGER_KEY).length, 0);

  // 15:00: 60 minutes before event 224 → the 60 and 120 warnings.
  clock.advance(150 * MINUTE);
  await world.app.tick();
  let soon = keys(world, SOON_TRIGGER_KEY);
  assert.deepEqual(
    soon.map((e) => e.data.lead),
    ['60', '120'],
  );
  assert.deepEqual(soon[0].data, {
    device: directionIds(world.gladys, 'down').device,
    start_time: '16:00',
    end_time: '20:00',
    duration_minutes: 240,
    lead: '60',
    minutes_until: 60,
    price: 0,
  });
  // 15:45: the 30 and 15 warnings; 15:56: the 5-minute one. Never twice.
  clock.advance(45 * MINUTE);
  await world.app.tick();
  clock.advance(11 * MINUTE);
  await world.app.tick();
  await world.app.tick();
  soon = keys(world, SOON_TRIGGER_KEY);
  assert.deepEqual(
    soon.map((e) => e.data.lead),
    ['60', '120', '15', '30', '5'],
  );

  // 20:01: ended.
  clock.advance(245 * MINUTE);
  await world.app.tick();
  const [ended] = keys(world, ENDED_TRIGGER_KEY);
  assert.equal(ended.data.start_time, '16:00');
  assert.equal(ended.data.duration_minutes, 240);

  // Next day noon: NESO announces event 225.
  clock.advance(16 * 60 * MINUTE);
  api.body = withRows(BODY_21, ROWS_225);
  await world.app.tick();
  const [announced] = keys(world, ANNOUNCED_TRIGGER_KEY);
  assert.equal(announced.data.day, 'dim. 22/11');
  assert.equal(announced.data.start_time, '16:00');
  assert.equal(announced.data.end_time, '21:00');
  assert.equal(announced.data.minutes_until, 239);
  await world.app.stop();

  // Restart on the same /data: nothing fires again.
  const before = world.fake.sceneEvents.length;
  const again = await createWorld({ api, clock, dataDir: world.dataDir });
  t.after(() => again.app.stop());
  await again.app.tick();
  assert.equal(
    again.fake.sceneEvents.length,
    0,
    `fired again: ${JSON.stringify(again.fake.sceneEvents)}`,
  );
  assert.ok(before > 0);
});

test('a kind not followed, or a device not added, fires nothing', async (t) => {
  const api = createFakeApi();
  const world = await createWorld({ api, created: false });
  t.after(() => world.app.stop());
  world.clock.advance(200 * MINUTE);
  await world.app.tick({ force: true });
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('reads every 10 minutes on its own timer, never through onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock();
  const world = await createWorld({ clock, timers: true });
  t.after(() => world.app.stop());
  assert.equal(world.api.count('datastore_search_sql'), 1);
  for (let i = 0; i < 10; i += 1) {
    clock.advance(TICK_MS);
    t.mock.timers.tick(TICK_MS);
    await new Promise((resolve) => setImmediate(resolve));
    await world.app.tick();
  }
  assert.equal(world.api.count('datastore_search_sql'), 2);
  assert.equal(world.api.count('package_show'), 1, 'the resource is looked up once a day');
});

test('no reading while no device is added and no widget is shown', async (t) => {
  const world = await createWorld({ created: false });
  t.after(() => world.app.stop());
  world.clock.advance(READ_MS);
  await world.app.tick();
  assert.equal(world.api.count('datastore_search_sql'), 0);
});

test('a period without events', async (t) => {
  const api = createFakeApi();
  api.body = EMPTY_BODY;
  const world = await createWorld({ api, config: { language: 'de' } });
  t.after(() => world.app.stop());
  assert.equal(stateOf(world, 'down', 'active'), 0);
  assert.equal(stateOf(world, 'down', 'upcoming_count'), 0);
  assert.equal(stateOf(world, 'down', 'next_start'), 'Keines angekündigt');
  assert.equal(world.fake.connectionStatus.connected, true);
  const ack = await world.fake.sceneAction(SCENE_ACTION_KEY, {
    device: directionIds(world.gladys, 'down').device,
  });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr ?? ack.error, /Aucun événement|No event/);
});

test('network cut: status down once, retried after 5 minutes, recovers; quiet logs', async (t) => {
  const api = createFakeApi();
  api.down = true;
  const world = await createWorld({ api });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.equal(
    world.fake.connectionStatus.message.fr,
    'Le portail de données de NESO est injoignable pour le moment.',
  );
  assert.equal(stateOf(world, 'down', 'active'), undefined);
  world.clock.advance(MINUTE);
  await world.app.tick();
  assert.equal(api.calls.length, 2, 'one query, one resource lookup');
  api.down = false;
  world.clock.advance(5 * MINUTE);
  await world.app.tick();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(stateOf(world, 'down', 'upcoming_count'), 1);
});

test('NESO archives the resource: found again by its name', async (t) => {
  const api = createFakeApi();
  const NEW_ID = '11111111-2222-4333-8444-555555555555';
  api.resourceId = NEW_ID;
  api.packageBody = structuredClone(api.packageBody);
  for (const resource of api.packageBody.result.resources) {
    if (resource.id === KNOWN_RESOURCE_ID) {
      resource.name = 'DFS Service Requirement (Archive 2026/2027)';
    }
  }
  api.packageBody.result.resources.push({
    id: NEW_ID,
    name: 'DFS Service Requirement',
    datastore_active: true,
  });
  const world = await createWorld({ api });
  t.after(() => world.app.stop());
  assert.equal(stateOf(world, 'down', 'upcoming_count'), 1);
  assert.equal(world.api.count('package_show'), 1);
});

test('a season archived: the old resource answers without rows, the new one is found within a day', async (t) => {
  const api = createFakeApi();
  const world = await createWorld({ api });
  t.after(() => world.app.stop());
  // April: NESO renames the resource "(Archive …)" and starts a new one. The
  // old one keeps answering, empty for the last 14 days.
  const NEW_ID = '11111111-2222-4333-8444-555555555555';
  api.packageBody = structuredClone(api.packageBody);
  for (const resource of api.packageBody.result.resources) {
    if (resource.id === KNOWN_RESOURCE_ID) {
      resource.name = 'DFS Service Requirement (Archive 2026/2027)';
    }
  }
  api.packageBody.result.resources.push({ id: NEW_ID, name: 'DFS Service Requirement' });
  const answer = api.answer;
  api.answer = (url) => {
    if (url.includes('datastore_search_sql') && url.includes(KNOWN_RESOURCE_ID)) {
      return answer(url).status === 200 ? new Response(JSON.stringify(EMPTY_BODY)) : answer(url);
    }
    return url.includes(NEW_ID) ? new Response(JSON.stringify(api.body)) : answer(url);
  };
  world.clock.advance(61 * MINUTE);
  await world.app.tick({ force: true });
  assert.equal(stateOf(world, 'down', 'upcoming_count'), 1);
  assert.equal(api.count(NEW_ID), 1);
});

test('the very first reading does not fire warnings already passed', async (t) => {
  // 15:30, event 224 at 16:00: the 30, 60 and 120 warnings are past.
  const world = await createWorld({ clock: createClock(Date.UTC(2026, 10, 21, 15, 30)) });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.sceneEvents, []);
  world.clock.advance(16 * MINUTE);
  await world.app.tick();
  assert.deepEqual(
    keys(world, SOON_TRIGGER_KEY).map((e) => e.data.lead),
    ['15'],
  );
});

test('test action: success message, and a red error when NESO is down', async (t) => {
  const api = createFakeApi();
  const world = await createWorld({ api, config: { language: 'en' } });
  t.after(() => world.app.stop());
  const ok = await world.fake.action('test_connection', {});
  assert.equal(ok.success, true, JSON.stringify(ok.error));
  assert.equal(
    ok.data.message.en,
    'NESO reached: 1 upcoming event(s), next: Sat 21/11 16:00–20:00',
  );
  assert.equal(
    ok.data.message.fr,
    'NESO joint : 1 événement(s) à venir, prochain : sam. 21/11 16:00–20:00',
  );
  api.down = true;
  const reused = await world.fake.action('test_connection', {});
  assert.equal(reused.success, true, 'a click within 30 s reuses the reading');
  world.clock.advance(31 * 1000);
  const ko = await world.fake.action('test_connection', {});
  assert.equal(ko.success, false);
  assert.match(ko.error.fr, /^Le portail de données de NESO est injoignable/);
});

test('test action without any kind followed fails', async (t) => {
  const world = await createWorld({ config: { follow_down: false } });
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection', {});
  assert.equal(ack.success, false);
  assert.ok(ack.error.fr);
  assert.equal(world.fake.connectionStatus.connected, false);
});

test('scene action: the next event, in progress or not; unknown device fails', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = directionIds(world.gladys, 'down').device;
  const ok = await world.fake.sceneAction(SCENE_ACTION_KEY, { device });
  assert.equal(ok.success, true, JSON.stringify(ok.error));
  assert.deepEqual(ok.data.outputs, {
    day: 'sam. 21/11',
    start_time: '16:00',
    end_time: '20:00',
    minutes_until: 210,
    duration_minutes: 240,
    in_progress: 0,
    price: 0,
  });
  world.clock.advance(240 * MINUTE);
  const during = await world.fake.sceneAction(SCENE_ACTION_KEY, { device });
  assert.equal(during.data.outputs.in_progress, 1);
  assert.equal(during.data.outputs.minutes_until, 0);
  const ko = await world.fake.sceneAction(SCENE_ACTION_KEY, { device: 'nope' });
  assert.equal(ko.success, false);
  assert.ok(ko.error.fr);
});

test('widget: next event, upcoming, last; during an event; valid content', async (t) => {
  const api = createFakeApi();
  api.body = withRows(BODY_21, ROWS_225);
  const world = await createWorld({ api, config: { language: 'en' } });
  t.after(() => world.app.stop());
  const show = async (settings = {}) => {
    const ack = await world.fake.widgetGet(WIDGET_KEY, { language: 'en', settings });
    assert.equal(ack.success, true, JSON.stringify(ack.error));
    const content = ack.data.content;
    assert.deepEqual(validateWidgetContent(content).errors ?? [], []);
    return content;
  };
  let content = await show();
  assert.equal(content.components[0].text, 'Device down');
  assert.equal(content.components[1].label, 'Next: Sat 21/11');
  assert.equal(content.components[1].value, '16:00–20:00');
  assert.equal(content.components[2].value, '3 h 30');
  const status = content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((i) => [i.label, i.value]),
    [
      ['Sun 22/11', '16:00–21:00'],
      ['Last event: Fri 20/11', '16:00–21:00'],
    ],
  );
  content = await show({ show_upcoming: false, show_last: false });
  assert.equal(
    content.components.find((c) => c.type === 'status'),
    undefined,
  );
  world.clock.advance(240 * MINUTE);
  content = await show();
  assert.equal(content.components[1].label, 'In progress until');
  assert.equal(content.components[1].value, '20:00');
  assert.equal(content.components[2].value, '3 h 30');
});

test('widget without any kind followed asks to follow one', async (t) => {
  const world = await createWorld({ config: { follow_down: false } });
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetGet(WIDGET_KEY, { language: 'fr' });
  assert.match(ack.data.content.components[0].text, /Suivez au moins/);
});

test('a device added gets every state again and refreshes the widget', async (t) => {
  const world = await createWorld({ created: false });
  t.after(() => world.app.stop());
  const id = directionIds(world.gladys, 'down').device;
  await world.fake.deviceCreated({ external_id: id, name: 'DFS', features: [] });
  assert.equal(stateOf(world, 'down', 'upcoming_count'), 1);
  assert.ok(world.fake.widgetRefreshes.includes(WIDGET_KEY));
});

/** Capture what the SDK logger writes (console.log / console.error). */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

test('a normal day writes nothing at info; an outage is one warning and one recovery', async (t) => {
  const api = createFakeApi();
  const clock = createClock(Date.UTC(2026, 10, 22, 0, 0));
  const world = await createWorld({ api, clock });
  t.after(() => world.app.stop());
  const lines = captureLogs(t);
  for (let i = 0; i < 10 * 60; i += 1) {
    clock.advance(MINUTE);
    await world.app.tick();
  }
  await world.fake.widgetGet(WIDGET_KEY);
  assert.ok(api.count('datastore_search_sql') >= 60);
  assert.deepEqual(lines, []);
  api.down = true;
  for (let i = 0; i < 60; i += 1) {
    clock.advance(MINUTE);
    await world.app.tick();
  }
  api.down = false;
  for (let i = 0; i < 10; i += 1) {
    clock.advance(MINUTE);
    await world.app.tick();
  }
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /WARN.*NESO events cannot be read/);
  assert.match(lines[1], /INFO.*answers again/);
});
