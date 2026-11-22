// The NESO rows → events, on real answers (22/11/2026).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRow } from '../src/api.js';
import { groupEvents, isActive, lastEnded, nextEvent, upcoming } from '../src/events.js';
import { BST_BODY, EMPTY_BODY, START, WEEK_BODY } from './helpers/world.js';

const iso = (ms) => new Date(ms).toISOString();

test('the week of 16–22/11/2026 holds 5 turn-down and 2 turn-up events', () => {
  const events = groupEvents(WEEK_BODY.result.records);
  assert.equal(events.filter((e) => e.direction === 'down').length, 5);
  assert.equal(events.filter((e) => e.direction === 'up').length, 2);
  const last = events.at(-2);
  assert.equal(last.key, '2026-11-21#224#down');
  assert.equal(iso(last.start), '2026-11-21T16:00:00.000Z');
  assert.equal(iso(last.end), '2026-11-21T20:00:00.000Z');
  assert.equal(last.slots.length, 8);
  assert.equal(last.mw, 500);
  assert.equal(last.price, 0);
  assert.equal(last.tag, 'energy');
  // Two turn-up events the same day, back to back, stay two events.
  const up = events.filter((e) => e.direction === 'up');
  assert.deepEqual(
    up.map((e) => [e.id, iso(e.start), iso(e.end)]),
    [
      [219, '2026-11-17T11:00:00.000Z', '2026-11-17T16:00:00.000Z'],
      [220, '2026-11-17T16:00:00.000Z', '2026-11-17T23:00:00.000Z'],
    ],
  );
});

test('a summer event: UTC times one hour before the local ones', () => {
  const [event] = groupEvents(BST_BODY.result.records);
  assert.equal(iso(event.start), '2026-04-14T16:00:00.000Z');
  assert.equal(iso(event.end), '2026-04-14T21:00:00.000Z');
});

test('slots around midnight land on the right day', () => {
  const row = {
    'Event ID': '7',
    'Event Type': 'Downwards',
    'Delivery Date': '2026-06-01',
    Service_Requirement_Type: 'Live',
  };
  // 00:00–00:30 BST is 23:00–23:30 UTC the day before.
  const early = parseRow({
    ...row,
    From_Local: '00:00',
    To_Local: '00:30',
    From_UTC: '23:00',
    To_UTC: '23:30',
  });
  assert.equal(iso(early.from), '2026-05-31T23:00:00.000Z');
  assert.equal(iso(early.to), '2026-05-31T23:30:00.000Z');
  // 23:30–00:00 BST is 22:30–23:00 UTC the same day.
  const late = parseRow({
    ...row,
    From_Local: '23:30',
    To_Local: '00:00',
    From_UTC: '22:30',
    To_UTC: '23:00',
  });
  assert.equal(iso(late.from), '2026-06-01T22:30:00.000Z');
  assert.equal(iso(late.to), '2026-06-01T23:00:00.000Z');
  // 23:30–00:00 GMT ends at midnight the next day.
  const winter = parseRow({
    ...row,
    'Delivery Date': '2026-12-01',
    From_Local: '23:30',
    To_Local: '00:00',
    From_UTC: '23:30',
    To_UTC: '00:00',
  });
  assert.equal(iso(winter.to), '2026-12-02T00:00:00.000Z');
});

test('unusable rows are skipped', () => {
  assert.equal(
    parseRow({
      'Event Type': 'Sideways',
      'Delivery Date': '2026-11-21',
      From_UTC: '16:00',
      To_UTC: '16:30',
      'Event ID': 1,
    }),
    null,
  );
  assert.equal(
    parseRow({
      'Event Type': 'Downwards',
      'Delivery Date': '',
      From_UTC: '16:00',
      To_UTC: '16:30',
      'Event ID': 1,
    }),
    null,
  );
  assert.equal(
    parseRow({
      'Event Type': 'Downwards',
      'Delivery Date': '2026-11-21',
      From_UTC: '25:00',
      To_UTC: '16:30',
      'Event ID': 1,
    }),
    null,
  );
  assert.equal(parseRow(null), null);
  assert.deepEqual(groupEvents(EMPTY_BODY.result.records), []);
});

test('next, upcoming, in progress, last', () => {
  const down = groupEvents(WEEK_BODY.result.records).filter((e) => e.direction === 'down');
  assert.equal(nextEvent(down, START).key, '2026-11-21#224#down');
  assert.equal(upcoming(down, START).length, 2);
  assert.equal(isActive(nextEvent(down, START), START), false);
  assert.equal(lastEnded(down, START).key, '2026-11-20#223#down');
  const during = Date.parse('2026-11-21T17:00:00Z');
  assert.equal(isActive(nextEvent(down, during), during), true);
  assert.equal(upcoming(down, during).length, 1);
  const after = Date.parse('2026-11-21T20:00:00Z');
  assert.equal(nextEvent(down, after).key, '2026-11-22#225#down');
  assert.equal(lastEnded(down, after).key, '2026-11-21#224#down');
  const later = Date.parse('2026-11-22T21:00:00Z');
  assert.equal(nextEvent(down, later), null);
});
