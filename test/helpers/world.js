// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake NESO Data Portal behind
// a fake `fetch` serving real answers (22/11/2026), a temporary /data and a
// manual clock, with the integration wired on top through registerHandlers.
// No timer runs unless `timers: true`: the tests call `app.tick()`. No test
// touches the network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { API_URL, KNOWN_RESOURCE_ID } from '../../src/api.js';
import { normalizeConfig } from '../../src/config.js';
import { directionIds } from '../../src/devices.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

/** Real answers of the NESO Data Portal, read on 22/11/2026. */
export const WEEK_BODY = fixture('sql-2026-11-16.json'); // 16–22/11: 5 down, 2 up events
/** The rows of event 225 (22/11, 16:00–21:00), announced on 22/11 around noon. */
export const ROWS_225 = WEEK_BODY.result.records.filter((r) => r['Delivery Date'] === '2026-11-22');
/** What the portal held on 21/11 at 12:30: everything but event 225. */
export const BODY_21 = structuredClone(WEEK_BODY);
BODY_21.result.records = BODY_21.result.records.filter((r) => r['Delivery Date'] !== '2026-11-22');
export const EMPTY_BODY = fixture('sql-empty.json'); // a period without events
export const BST_BODY = fixture('sql-2026-04-14-bst.json'); // a summer event, local = UTC + 1
export const PACKAGE_BODY = fixture('package-show.json');

/** 2026-11-21 12:30 UTC: event 224 announced at noon runs 16:00–20:00. */
export const START = Date.UTC(2026, 10, 21, 12, 30, 0);
export const TIME_ZONE = 'Europe/London';
export const MINUTE = 60 * 1000;

export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * A fake NESO Data Portal: `api.body` is what the datastore answers for the
 * known resource; `api.down` cuts the network. Every URL is recorded.
 */
export function createFakeApi() {
  const api = {
    calls: [],
    down: false,
    body: BODY_21,
    packageBody: PACKAGE_BODY,
    resourceId: KNOWN_RESOURCE_ID,
    answer(url) {
      if (url.startsWith(`${API_URL}/package_show`)) {
        return json(200, api.packageBody);
      }
      if (url.startsWith(`${API_URL}/datastore_search_sql`)) {
        const sql = decodeURIComponent(url.split('sql=')[1]);
        if (!sql.includes(`"${api.resourceId}"`)) {
          return json(409, { success: false, error: { __type: 'Validation Error' } });
        }
        return json(200, api.body);
      }
      return json(404, { success: false });
    },
    /** @type {typeof fetch} */
    fetch: async (url) => {
      api.calls.push(String(url));
      if (api.down) {
        throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
      }
      return api.answer(String(url));
    },
    count: (part) => api.calls.filter((url) => url.includes(part)).length,
  };
  return api;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {boolean} [options.created] the devices are already added in Gladys
 * @param {ReturnType<typeof createFakeApi>} [options.api]
 * @param {ReturnType<typeof createClock>} [options.clock]
 * @param {string} [options.dataDir] reuse a /data (restart)
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 */
export async function createWorld({
  config = {},
  created = true,
  api = createFakeApi(),
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'dfs-test-')),
  connect = true,
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config });
  if (created) {
    gladys.fake.devices = normalizeConfig(config).directions.map((direction) => ({
      external_id: directionIds(gladys, direction).device,
      name: `Device ${direction}`,
      features: [],
    }));
  }
  const app = registerHandlers(gladys, {
    fetch: api.fetch,
    store: new Store(dataDir),
    now: clock.now,
    timers,
    timeZone: TIME_ZONE,
  });
  if (connect) {
    await gladys.connect();
  }
  return { gladys, fake: gladys.fake, app, api, clock, dataDir };
}

/** The devices discovered for a configuration. */
export async function discoveredDevices(config) {
  const world = await createWorld({ config, created: false });
  await world.app.stop();
  return world.fake.discoveredDevices;
}

/** The latest published value of a feature key of a direction's device. */
export function stateOf(world, direction, key) {
  const id = directionIds(world.gladys, direction).feature(key);
  const found = world.fake.states.filter((s) => s.device_feature_external_id === id).at(-1);
  return found ? (found.text ?? found.state) : undefined;
}

/** A body with extra rows (a new event announced). */
export function withRows(body, rows) {
  const copy = structuredClone(body);
  copy.result.records.push(...rows);
  return copy;
}
