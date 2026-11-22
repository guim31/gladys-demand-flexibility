// -----------------------------------------------------------------------------
// The "Next DFS event" dashboard widget, for one kind of event:
//   heading   the name of the device in Gladys
//   tile      the event in progress (until when) or the next one (day, start)
//   tile      starts in / ends in
//   tile      guaranteed price, when NESO set one
//   status    the other upcoming events, and the last one over (each optional)
//   caption   when the NESO data was read
// Budget (core): 8 components, 2 texts at most — this uses at most 6, 2 texts.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { isActive, lastEnded, minutesUntil, nextEvent, upcoming } from './events.js';
import { MESSAGES, TEXT, clockTime, dayText, durationText, pick } from './i18n.js';

export const WIDGET_KEY = 'next_event';

/** Events move a few times a day: refetched every 5 minutes at most. */
export const WIDGET_TTL_SECONDS = 300;

/** Status rows at most (the core accepts 10). */
const MAX_ROWS = 6;

/** Down: use less now (warning); up: use more (info). */
const COLORS = { down: WIDGET_COLORS.WARNING, up: WIDGET_COLORS.INFO };

const span = (event, timeZone) =>
  `${clockTime(event.start, timeZone)}–${clockTime(event.end, timeZone)}`;

/**
 * @param {object} options
 * @param {string | null} options.title the device name, null without a device
 * @param {'down' | 'up'} [options.direction]
 * @param {import('./events.js').DfsEvent[] | null} [options.events] of this direction; null: never read
 * @param {number | null} [options.fetchedAt]
 * @param {number} [options.now]
 * @param {boolean} [options.showUpcoming]
 * @param {boolean} [options.showLast]
 * @param {boolean} [options.failing]
 * @param {string} options.language
 * @param {string} [options.timeZone]
 */
export function buildWidgetContent({
  title,
  direction,
  events,
  fetchedAt,
  now,
  showUpcoming = true,
  showLast = true,
  failing = false,
  language,
  timeZone,
}) {
  const components = [];
  if (title === null) {
    components.push({ type: 'text', variant: 'body', text: pick(TEXT.noDevice, language) });
    return { ttl_seconds: WIDGET_TTL_SECONDS, components };
  }
  components.push({ type: 'text', variant: 'heading', text: title });
  if (!events) {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(failing ? TEXT.unreachable : TEXT.waiting, language),
    });
    return { ttl_seconds: WIDGET_TTL_SECONDS, components };
  }
  const color = COLORS[direction] ?? WIDGET_COLORS.PRIMARY;
  const next = nextEvent(events, now);
  if (!next) {
    components.push({
      type: 'value',
      label: pick(TEXT.nextEvent, language),
      value: pick(TEXT.noneShort, language),
      icon: 'calendar',
      color: WIDGET_COLORS.NEUTRAL,
    });
  } else if (isActive(next, now)) {
    components.push(
      {
        type: 'value',
        label: pick(TEXT.inProgressUntil, language),
        value: clockTime(next.end, timeZone),
        icon: 'zap',
        color,
      },
      {
        type: 'value',
        label: pick(TEXT.endsIn, language),
        value: durationText(minutesUntil(next.end, now)),
        icon: 'clock',
      },
    );
  } else {
    components.push(
      {
        type: 'value',
        label: `${pick(TEXT.nextOn, language)} ${dayText(next.start, language, timeZone)}`,
        value: span(next, timeZone).slice(0, 12),
        icon: 'calendar',
        color,
      },
      {
        type: 'value',
        label: pick(TEXT.startsIn, language),
        value: durationText(minutesUntil(next.start, now)),
        icon: 'clock',
      },
    );
  }
  if (next && next.price > 0) {
    components.push({
      type: 'value',
      label: pick(TEXT.price, language),
      value: Math.round(next.price),
      unit: '£/MWh',
      icon: 'dollar-sign',
      color: WIDGET_COLORS.SUCCESS,
    });
  }
  const items = [];
  if (showUpcoming) {
    for (const event of upcoming(events, now).filter((e) => e !== next)) {
      items.push({
        label: dayText(event.start, language, timeZone),
        value: span(event, timeZone),
        color,
      });
    }
  }
  items.splice(showLast ? MAX_ROWS - 1 : MAX_ROWS);
  const last = showLast ? lastEnded(events, now) : null;
  if (last) {
    items.push({
      label: `${pick(TEXT.lastEvent, language)} ${dayText(last.start, language, timeZone)}`,
      value: span(last, timeZone),
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }
  if (fetchedAt) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: pick(MESSAGES.updatedAt(clockTime(fetchedAt, timeZone)), language),
    });
  }
  return { ttl_seconds: WIDGET_TTL_SECONDS, components };
}
