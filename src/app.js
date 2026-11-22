// -----------------------------------------------------------------------------
// The integration, wired on a Gladys client (the real one in index.js, the
// SDK's fake Gladys in the tests).
//
// Refresh: the devices declare no poll frequency (the core does not poll
// external devices reliably, Gladys#3198). The container ticks every minute
// on its own timer. A tick
//   - reads NESO every 10 minutes (events are announced the same day, around
//     noon, for the afternoon and evening) when a device is added or a widget
//     was shown in the last hour; a failed read is retried after 5 minutes;
//   - publishes the states that changed (an event starts or ends without a
//     new read);
//   - fires the scene triggers.
// The core's onPoll, if it ever calls it, only runs a tick when the timer
// missed one: it is the fallback.
//
// Triggers, remembered under /data so a restart does not fire them again:
//   - "event_announced": an event not seen before appears (the very first
//     reading only records what is already there);
//   - "event_starting_soon": once per event and per warning (5 to 120 min);
//   - "event_ended": once per event, within 2 hours of its end.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { KNOWN_RESOURCE_ID, fetchRows, resolveResourceId } from './api.js';
import { LEADS, normalizeConfig } from './config.js';
import { buildDevices, directionIds, directionStates } from './devices.js';
import {
  durationMinutes,
  groupEvents,
  isActive,
  minutesUntil,
  nextEvent,
  upcoming,
} from './events.js';
import {
  ActionFailure,
  MESSAGES,
  NAMES,
  TEXT,
  clockTime,
  dayText,
  eventText,
  pick,
} from './i18n.js';
import { createIssueLog } from './issues.js';
import { Store } from './store.js';
import { WIDGET_KEY, buildWidgetContent } from './widgets.js';

const logger = createLogger({ name: 'demand-flexibility' });

export const TICK_MS = 60 * 1000;
export const READ_MS = 10 * 60 * 1000;
export const RETRY_MS = 5 * 60 * 1000;
/** The resource id is looked up again at most this often after a failure. */
export const RESOLVE_MS = 60 * 60 * 1000;
/** …and once a day anyway: an archived resource still answers, without new rows. */
export const RESOLVE_DAILY_MS = 24 * 60 * 60 * 1000;
/** The test action reuses a reading this recent. */
export const ACTION_REUSE_MS = 30 * 1000;
export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;
/** Days of history read: enough to show the last event. */
export const HISTORY_DAYS = 14;
/** An event ended longer ago than this does not fire "event_ended" any more. */
export const ENDED_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Trigger memory older than this is dropped. */
const MEMORY_MS = 40 * 24 * 60 * 60 * 1000;
const WIDGET_INTEREST_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const ACTION_KEY = 'test_connection';
export const ANNOUNCED_TRIGGER_KEY = 'event_announced';
export const SOON_TRIGGER_KEY = 'event_starting_soon';
export const ENDED_TRIGGER_KEY = 'event_ended';
export const SCENE_ACTION_KEY = 'get_next_event';

const emptyMemory = () => ({ initialized: false, seen: {}, soon: {}, ended: {} });

/**
 * @param {object} gladys GladysIntegration, or the SDK's fake Gladys
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @param {Store} [options.store]
 * @param {() => number} [options.now]
 * @param {boolean} [options.timers] run the minute timer
 * @param {string} [options.timeZone] for the clock times (TZ of Gladys by default)
 */
export function registerHandlers(
  gladys,
  {
    fetch: fetchImpl = globalThis.fetch,
    store = new Store(),
    now = () => Date.now(),
    timers = true,
    timeZone,
  } = {},
) {
  let config = normalizeConfig(gladys.config ?? {});
  /** What /data keeps: event keys → end time (ms), per trigger. */
  let memory = emptyMemory();
  /** Every event read, both directions; null until the first reading. */
  let events = null;
  let fetchedAt = null;
  let lastAttempt = -Infinity;
  let resourceId = KNOWN_RESOURCE_ID;
  let lastResolve = -Infinity;
  let widgetShownAt = -Infinity;
  let lastTickAt = -Infinity;
  let lastStatus = null;
  let timer = null;
  let stopped = false;
  let ticking = null;
  let reading = null;
  let lastError = null;

  const apiIssues = createIssueLog(logger.child('api'));
  const gladysIssues = createIssueLog(logger);

  const ready = store.load().then((data) => {
    memory = {
      initialized: data.initialized === true,
      seen: isObject(data.seen) ? data.seen : {},
      soon: isObject(data.soon) ? data.soon : {},
      ended: isObject(data.ended) ? data.ended : {},
    };
  });

  const deviceId = (direction) => directionIds(gladys, direction).device;
  const isCreated = (direction) =>
    (gladys.devices ?? []).some((device) => device.external_id === deviceId(direction));
  const directionOf = (externalId) =>
    config.directions.find((direction) => deviceId(direction) === externalId) ?? null;
  const eventsOf = (direction) => (events ? events.filter((e) => e.direction === direction) : null);
  const wanted = () =>
    config.directions.some(isCreated) || now() - widgetShownAt < WIDGET_INTEREST_MS;
  const failing = () => apiIssues.isFailing('read');

  // --- Reading NESO -----------------------------------------------------------

  /** Look the resource up again by name; true when it changed. */
  async function resolve() {
    lastResolve = now();
    const found = await resolveResourceId(fetchImpl);
    if (found === resourceId) {
      return false;
    }
    logger.info(`NESO resource "DFS Service Requirement" is now ${found}`);
    resourceId = found;
    return true;
  }

  async function read() {
    lastAttempt = now();
    const since = new Date(now() - HISTORY_DAYS * DAY_MS).toISOString().slice(0, 10);
    // Once a day, and at start: when a season is archived, the old resource
    // keeps answering (with no new rows), so an error alone would not tell.
    if (now() - lastResolve >= RESOLVE_DAILY_MS) {
      await resolve().catch((err) => logger.debug(`Resource lookup failed: ${err.message}`));
    }
    let rows;
    try {
      rows = await fetchRows(fetchImpl, resourceId, since);
    } catch (err) {
      // 404/409: the resource may have been replaced; look it up again (at
      // most once an hour).
      if (now() - lastResolve < RESOLVE_MS || !(await resolve())) {
        throw err;
      }
      rows = await fetchRows(fetchImpl, resourceId, since);
    }
    if (rows.length === 0 && now() - lastResolve >= RESOLVE_MS && (await resolve())) {
      rows = await fetchRows(fetchImpl, resourceId, since);
    }
    return groupEvents(rows);
  }

  /** Read now; true when NESO answered. One reading at a time. */
  async function refresh() {
    if (reading) {
      return reading;
    }
    reading = (async () => {
      try {
        const fresh = await read();
        const first = events === null;
        events = fresh;
        fetchedAt = now();
        if (first) {
          logger.info(
            `NESO Data Portal reachable (${fresh.length} event(s) in ${HISTORY_DAYS} days)`,
          );
        }
        apiIssues.ok('read', 'The NESO Data Portal answers again');
        logger.debug(`${fresh.length} event(s) read`);
        return true;
      } catch (err) {
        lastError = err;
        apiIssues.fail('read', `NESO events cannot be read: ${err.message}`);
        return false;
      }
    })().finally(() => {
      reading = null;
    });
    return reading;
  }

  const isDue = () => now() - lastAttempt >= (failing() || events === null ? RETRY_MS : READ_MS);

  // --- States and triggers ----------------------------------------------------

  async function publishStates() {
    const options = { now: now(), language: config.language, timeZone };
    const states = config.directions
      .filter(isCreated)
      .flatMap((direction) => directionStates(gladys, direction, eventsOf(direction), options));
    if (states.length === 0) {
      return;
    }
    try {
      const { count } = await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      if (count > 0) {
        logger.debug(`${count} state(s) published`);
      }
      gladysIssues.ok('states', 'States accepted by Gladys again');
    } catch (err) {
      gladysIssues.fail('states', `States not accepted by Gladys: ${err.message}`);
    }
  }

  /** The variables every trigger carries about an event. */
  function eventData(event) {
    return {
      device: deviceId(event.direction),
      start_time: clockTime(event.start, timeZone),
      end_time: clockTime(event.end, timeZone),
      duration_minutes: durationMinutes(event),
    };
  }

  async function fireTriggers() {
    if (!events) {
      return;
    }
    let changed = false;
    const t = now();
    const followed = events.filter((e) => config.directions.includes(e.direction));
    if (!memory.initialized) {
      // First reading ever: what is already announced or over is not news.
      for (const event of events) {
        memory.seen[event.key] = event.end;
        if (event.end <= t) {
          memory.ended[event.key] = event.end;
        }
        // Warnings already passed are not news either.
        if (event.start > t) {
          memory.soon[event.key] = LEADS.filter((l) => minutesUntil(event.start, t) <= Number(l));
        }
      }
      memory.initialized = true;
      changed = true;
    }
    for (const event of followed) {
      if (!isCreated(event.direction)) {
        continue;
      }
      if (!(event.key in memory.seen)) {
        let fired = true;
        if (event.end > t) {
          fired = await fire(ANNOUNCED_TRIGGER_KEY, {
            ...eventData(event),
            day: dayText(event.start, config.language, timeZone),
            minutes_until: minutesUntil(event.start, t),
            price: Math.round(event.price),
          });
          if (fired) {
            logger.info(
              `DFS event announced: ${pick(eventText(event, timeZone), 'en')} (${event.direction})`,
            );
          }
        }
        if (fired) {
          memory.seen[event.key] = event.end;
          changed = true;
        }
      }
      if (event.start > t) {
        const left = minutesUntil(event.start, t);
        const done = Array.isArray(memory.soon[event.key]) ? memory.soon[event.key] : [];
        for (const lead of LEADS.filter((l) => left <= Number(l) && !done.includes(l))) {
          const fired = await fire(SOON_TRIGGER_KEY, {
            ...eventData(event),
            lead,
            minutes_until: left,
            price: Math.round(event.price),
          });
          if (fired) {
            memory.soon[event.key] = [...(memory.soon[event.key] ?? []), lead];
            changed = true;
          }
        }
      }
      if (event.end <= t && !(event.key in memory.ended)) {
        let fired = true;
        if (t - event.end < ENDED_WINDOW_MS) {
          fired = await fire(ENDED_TRIGGER_KEY, eventData(event));
        }
        if (fired) {
          memory.ended[event.key] = event.end;
          changed = true;
        }
      }
    }
    // Forget what is long over.
    for (const part of [memory.seen, memory.ended]) {
      for (const [key, end] of Object.entries(part)) {
        if (!(t - Number(end) < MEMORY_MS)) {
          delete part[key];
          changed = true;
        }
      }
    }
    const current = new Set(events.map((e) => e.key));
    for (const key of Object.keys(memory.soon)) {
      if (!(key in memory.seen) && !current.has(key)) {
        delete memory.soon[key];
        changed = true;
      }
    }
    if (changed) {
      store.save(memory);
    }
  }

  /** Fire one trigger; false when Gladys refused it (fired again next tick). */
  async function fire(key, data) {
    try {
      await gladys.publishSceneEvent(key, data);
      gladysIssues.ok(`scene-${key}`, `Scene event ${key} accepted by Gladys again`);
      return true;
    } catch (err) {
      gladysIssues.fail(`scene-${key}`, `Scene event ${key} not sent to Gladys: ${err.message}`);
      return false;
    }
  }

  /** The application status of the Configuration screen, sent on change only. */
  async function reportStatus() {
    let status = { connected: true };
    if (config.directions.length === 0) {
      status = { connected: false, message: TEXT.noDevice };
    } else if (failing() && wanted()) {
      status = { connected: false, message: TEXT.unreachable };
    }
    const key = JSON.stringify(status);
    if (key === lastStatus) {
      return;
    }
    try {
      await gladys.setConnectionStatus(status.connected, status.message);
      lastStatus = key;
    } catch (err) {
      logger.debug(`Connection status not sent: ${err.message}`);
    }
  }

  // --- The tick ---------------------------------------------------------------

  /**
   * Read when due, publish what changed, fire the triggers. One tick at a
   * time: a second caller waits for the one in progress.
   * @param {{ force?: boolean }} [options] force: read now
   */
  async function tick({ force = false } = {}) {
    while (force && ticking) {
      await ticking.catch(() => {});
    }
    if (ticking) {
      return ticking;
    }
    ticking = (async () => {
      lastTickAt = now();
      if (gladys.connected === false) {
        logger.debug('Gladys unreachable: tick skipped');
        return;
      }
      let fresh = false;
      if (config.directions.length > 0 && wanted() && (force || isDue())) {
        fresh = await refresh();
      }
      await publishStates();
      await fireTriggers();
      await reportStatus();
      if (fresh) {
        gladys.requestWidgetRefresh(WIDGET_KEY);
      }
    })().finally(() => {
      ticking = null;
    });
    return ticking;
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      try {
        await tick();
      } catch (err) {
        logger.error(`Refresh failed (${err.message})`);
      } finally {
        schedule();
      }
    }, TICK_MS);
  }

  /** (Re)start: publish the devices, read, then every minute. */
  async function start() {
    await ready;
    stopped = false;
    lastStatus = null;
    try {
      await gladys.publishDiscoveredDevices(buildDevices(gladys, config));
    } catch (err) {
      logger.error(`Publishing the devices failed: ${err.message}`);
    }
    logger.info(`Following DFS events: ${config.directions.join(', ') || 'none'}`);
    schedule();
    await tick({ force: true });
  }

  /** The events of a direction for the action and the widget, read if never read. */
  async function eventsFor(direction) {
    if (events === null && isDue()) {
      await refresh();
    }
    return eventsOf(direction);
  }

  // --- Handlers ---------------------------------------------------------------

  gladys.onScanRequest(async () => {
    await gladys.publishDiscoveredDevices(buildDevices(gladys, config));
  });

  gladys.onPoll(async () => {
    if (now() - lastTickAt < TICK_MS * 0.9) {
      return;
    }
    await tick();
  });

  // A device just added: every state again now (the core dropped the ones it
  // received before the feature existed), and the widget can show it.
  const onDeviceAdded = async (device) => {
    if (directionOf(device?.external_id) && events === null) {
      await refresh();
    }
    await publishStates();
    gladys.requestWidgetRefresh(WIDGET_KEY);
  };
  // (The SDK forgets the values it published for that device: they all go again.)
  gladys.onDeviceCreated(onDeviceAdded);
  gladys.onDeviceUpdated(onDeviceAdded);
  gladys.onDeviceDeleted(async () => {
    gladys.requestWidgetRefresh(WIDGET_KEY);
  });

  gladys.onAction(ACTION_KEY, async () => {
    logger.info('Action: test the NESO Data Portal');
    if (config.directions.length === 0) {
      throw new ActionFailure(TEXT.noDevice);
    }
    // Repeated clicks reuse a reading less than 30 s old: NESO asks for no
    // more than 2 datastore queries a minute.
    const ok =
      now() - lastAttempt < ACTION_REUSE_MS && reading === null ? !failing() : await refresh();
    if (!ok || !events) {
      await reportStatus();
      throw new ActionFailure(MESSAGES.unreachable(lastError?.message ?? 'no answer'));
    }
    await publishStates();
    await reportStatus();
    const followed = events.filter((e) => config.directions.includes(e.direction));
    const next = nextEvent(followed, now());
    return MESSAGES.reached(
      upcoming(followed, now()).length,
      next ? eventText(next, timeZone) : null,
    );
  });

  gladys.onSceneAction(SCENE_ACTION_KEY, async (fields = {}) => {
    const direction = directionOf(fields.device);
    if (!direction) {
      throw new ActionFailure(TEXT.unknownDevice);
    }
    const list = await eventsFor(direction);
    if (!list) {
      throw new ActionFailure(TEXT.unreachable);
    }
    const next = nextEvent(list, now());
    if (!next) {
      throw new ActionFailure(TEXT.noEvent);
    }
    logger.info(`Scene action: next ${direction} event asked`);
    return {
      day: dayText(next.start, config.language, timeZone),
      start_time: clockTime(next.start, timeZone),
      end_time: clockTime(next.end, timeZone),
      minutes_until: minutesUntil(next.start, now()),
      duration_minutes: durationMinutes(next),
      in_progress: isActive(next, now()) ? 1 : 0,
      price: Math.round(next.price),
    };
  });

  gladys.onWidgetGet(WIDGET_KEY, async ({ settings = {}, language }) => {
    const direction = settings.device
      ? directionOf(settings.device)
      : (config.directions[0] ?? null);
    if (!direction) {
      return buildWidgetContent({ title: null, language });
    }
    widgetShownAt = now();
    const list = await eventsFor(direction);
    const device = (gladys.devices ?? []).find((d) => d.external_id === deviceId(direction));
    const names = NAMES[language] ?? NAMES.en;
    return buildWidgetContent({
      title: device?.name ?? names[`device_${direction}`],
      direction,
      events: list,
      fetchedAt,
      now: now(),
      showUpcoming: settings.show_upcoming !== false && settings.show_upcoming !== 'false',
      showLast: settings.show_last !== false && settings.show_last !== 'false',
      failing: failing(),
      language,
      timeZone,
    });
  });

  gladys.onConfigUpdated(async (raw) => {
    config = normalizeConfig(raw);
    logger.info('New configuration received');
    await start();
  });

  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      await start();
    } catch (err) {
      logger.error(`Post-connection initialization failed: ${err.message}`);
      await gladys.setConnectionStatus(false, TEXT.initFailed).catch(() => {});
    }
  });

  return {
    ready,
    tick,
    get events() {
      return events;
    },
    get memory() {
      return memory;
    },
    /** Stop the timer and wait for the last write under /data. */
    async stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
      await ticking?.catch(() => {});
      await store.flush();
    },
  };
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
