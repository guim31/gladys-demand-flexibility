// -----------------------------------------------------------------------------
// One device per kind of event followed ("down": reduce consumption, "up":
// increase it), and its states.
//
//   input/binary                 1 while an event is in progress
//   counter-sensor/integer       number of events announced, not started yet
//   text/text                    start of the event in progress or next one
//                                ("sam. 21/11 16:00"), or "none announced"
//   text/text                    its end ("20:00")
//   counter-sensor/integer + £   its guaranteed acceptance price, GBP/MWh
//                                (0: none; NESO rarely sets one)
//
// Ids are built from the direction key: stable, never a label. No poll
// frequency: the container reads NESO every 10 minutes and pushes the states
// from its own minute timer (src/app.js).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { isActive, nextEvent, upcoming } from './events.js';
import { NAMES, clockTime, dayTime } from './i18n.js';

export const DEVICE_TYPE = 'direction';

/** Feature keys: frozen once published (Gladys keys history and scenes on them). */
export const FEATURES = ['active', 'upcoming_count', 'next_start', 'next_end', 'next_price'];

export const directionIds = (gladys, direction) => gladys.externalIds(DEVICE_TYPE, direction);

const base = { read_only: true, has_feedback: false, keep_history: true };

/**
 * The discovery payload: one device per direction followed.
 * @param {object} gladys
 * @param {{ language: string, directions: string[] }} config
 */
export function buildDevices(gladys, config) {
  const names = NAMES[config.language] ?? NAMES.fr;
  return config.directions.map((direction) => {
    const ids = directionIds(gladys, direction);
    const feature = (key, definition) => ({
      ...base,
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    });
    const text = (key) =>
      feature(key, {
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        min: 0,
        max: 0,
        keep_history: false,
      });
    return {
      name: names[`device_${direction}`],
      external_id: ids.device,
      should_poll: false,
      features: [
        feature('active', {
          category: DEVICE_FEATURE_CATEGORIES.INPUT,
          type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
          min: 0,
          max: 1,
        }),
        feature('upcoming_count', {
          category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
          min: 0,
          max: 50,
        }),
        text('next_start'),
        text('next_end'),
        feature('next_price', {
          category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
          unit: DEVICE_FEATURE_UNITS.POUND_STERLING,
          min: 0,
          max: 10000,
        }),
      ],
    };
  });
}

/**
 * The states of a direction's device from the events read, at `now`.
 * @param {object} gladys
 * @param {string} direction
 * @param {import('./events.js').DfsEvent[] | null} events of this direction; null: never read
 * @param {{ now: number, language: string, timeZone?: string }} options
 */
export function directionStates(gladys, direction, events, { now, language, timeZone }) {
  if (!events) {
    return [];
  }
  const ids = directionIds(gladys, direction);
  const state = (key, value) => ({ device_feature_external_id: ids.feature(key), state: value });
  const text = (key, value) => ({ device_feature_external_id: ids.feature(key), text: value });
  const next = nextEvent(events, now);
  const names = NAMES[language] ?? NAMES.fr;
  return [
    state('active', next && isActive(next, now) ? 1 : 0),
    state('upcoming_count', upcoming(events, now).length),
    text('next_start', next ? dayTime(next.start, language, timeZone) : names.none),
    text('next_end', next ? clockTime(next.end, timeZone) : names.none),
    state('next_price', next ? Math.round(next.price) : 0),
  ];
}
