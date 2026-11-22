// -----------------------------------------------------------------------------
// From slots to events: NESO publishes one row per half-hour; an event is the
// rows sharing a delivery date and an Event ID (the ids restart each season).
// Pure functions, the clock is a parameter.
// -----------------------------------------------------------------------------

import { parseRow } from './api.js';

/**
 * @typedef {object} DfsEvent
 * @property {string} key "2026-11-21#224#down": stable, used by the trigger memory
 * @property {number} id
 * @property {string} date British delivery date
 * @property {'down' | 'up'} direction
 * @property {string} tag "energy" or "system"
 * @property {boolean} test a test event
 * @property {number} start ms
 * @property {number} end ms
 * @property {number} mw service requirement (largest slot)
 * @property {number} price guaranteed acceptance price, GBP/MWh (0: none)
 * @property {Array<{ from: number, to: number }>} slots
 */

/**
 * @param {object[]} rows datastore records
 * @returns {DfsEvent[]} sorted by start
 */
export function groupEvents(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const slot = parseRow(row);
    if (!slot) {
      continue;
    }
    // Same date and id for both directions has never been seen, but the key
    // (also the trigger memory key) keeps them apart if it happens.
    const key = `${slot.key}#${slot.direction}`;
    let event = byKey.get(key);
    if (!event) {
      event = {
        key,
        id: slot.id,
        date: slot.date,
        direction: slot.direction,
        tag: slot.tag,
        test: slot.test,
        start: slot.from,
        end: slot.to,
        mw: 0,
        price: 0,
        slots: [],
      };
      byKey.set(key, event);
    }
    event.start = Math.min(event.start, slot.from);
    event.end = Math.max(event.end, slot.to);
    event.mw = Math.max(event.mw, slot.mw);
    event.price = Math.max(event.price, slot.price);
    event.slots.push({ from: slot.from, to: slot.to });
  }
  return [...byKey.values()].sort((a, b) => a.start - b.start || a.id - b.id);
}

/** In one of its slots now (an event may have gaps between slots). */
export const isActive = (event, now) => event.slots.some((s) => s.from <= now && now < s.to);

/** Not started yet. */
export const upcoming = (events, now) => events.filter((e) => e.start > now);

/** The event in progress, or else the next one not over; null when none. */
export function nextEvent(events, now) {
  return events.find((e) => isActive(e, now)) ?? events.find((e) => e.end > now) ?? null;
}

/** The last event over. */
export function lastEnded(events, now) {
  const ended = events.filter((e) => e.end <= now);
  return ended.length > 0 ? ended.reduce((a, b) => (b.end >= a.end ? b : a)) : null;
}

export const minutesUntil = (time, now) => Math.max(0, Math.ceil((time - now) / 60000));
export const durationMinutes = (event) => Math.round((event.end - event.start) / 60000);
