// -----------------------------------------------------------------------------
// NESO Data Portal (CKAN) client for the Demand Flexibility Service.
//
// Dataset "demand-flexibility": the resource "DFS Service Requirement" lists
// every event NESO announces, one row per half-hour slot (date, local and UTC
// times, Downwards/Upwards, MW wanted, guaranteed acceptance price). NESO
// moves a season to an "(Archive 2025/2026)" resource and starts a new one:
// the resource id is therefore looked up by name (package_show), with the id
// known on 22/11/2026 as a fallback.
//
// No key, no account. NESO asks API users to stay under 1 request per second
// for the CKAN API and 2 per minute for the datastore: this integration makes
// one datastore query every 10 minutes (src/app.js).
// -----------------------------------------------------------------------------

import { HttpError, requestJson } from './http.js';
import { DIRECTIONS } from './config.js';

export const API_URL = 'https://api.neso.energy/api/3/action';
export const DATASET = 'demand-flexibility';
export const RESOURCE_NAME = 'DFS Service Requirement';
/** The resource of the 2026/2027 season, read on 22/11/2026. */
export const KNOWN_RESOURCE_ID = '3635fd80-49d7-4d02-964d-cc8c08d50302';

const WHAT = 'NESO Data Portal';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const COLUMNS = [
  'Event ID',
  'Event Type',
  'Event Tag',
  'Delivery Date',
  'From_Local',
  'To_Local',
  'From_UTC',
  'To_UTC',
  'Service Requirement MW',
  'Service Requirement Type',
  'Guaranteed Acceptance Price GBP per MWh',
];

/** The current "DFS Service Requirement" resource id, from the dataset. */
export async function resolveResourceId(fetchImpl) {
  const body = await requestJson(fetchImpl, `${API_URL}/package_show?id=${DATASET}`, {}, WHAT);
  const resources = body?.result?.resources;
  if (body?.success !== true || !Array.isArray(resources)) {
    throw new HttpError(`${WHAT} answered an unexpected dataset description`);
  }
  const found = resources.find(
    (r) =>
      String(r?.name ?? '')
        .trim()
        .toLowerCase() === RESOURCE_NAME.toLowerCase() && UUID.test(String(r?.id)),
  );
  if (!found) {
    throw new HttpError(`${WHAT}: no "${RESOURCE_NAME}" resource in the dataset`);
  }
  return found.id;
}

/**
 * The slot rows delivered on or after `sinceDate`.
 * @param {typeof fetch} fetchImpl
 * @param {string} resourceId a UUID (checked: it goes into the SQL text)
 * @param {string} sinceDate YYYY-MM-DD (built by the code, checked too)
 */
export async function fetchRows(fetchImpl, resourceId, sinceDate) {
  if (!UUID.test(resourceId) || !DATE.test(sinceDate)) {
    throw new Error('invalid resource id or date');
  }
  const columns = COLUMNS.map((c) => `"${c}"`).join(',');
  const sql = `SELECT ${columns} FROM "${resourceId}" WHERE "Delivery Date" >= '${sinceDate}' ORDER BY "Delivery Date", "From_UTC"`;
  const body = await requestJson(
    fetchImpl,
    `${API_URL}/datastore_search_sql?sql=${encodeURIComponent(sql)}`,
    {},
    WHAT,
  );
  const records = body?.result?.records;
  if (body?.success !== true || !Array.isArray(records)) {
    throw new HttpError(`${WHAT} answered an unexpected datastore result`);
  }
  return records;
}

/** "16:30" → 990 minutes, or NaN. */
function minutesOf(text) {
  const match = HHMM.exec(String(text ?? '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

/**
 * The UTC instant of a slot boundary. `Delivery Date` is the British local
 * date; the UTC time alone may belong to the day before (00:30 BST is 23:30
 * UTC the previous day), which the local time tells.
 */
function instant(date, utcText, localText) {
  const match = DATE.exec(String(date ?? '').slice(0, 10));
  const utc = minutesOf(utcText);
  const local = minutesOf(localText);
  if (!match || Number.isNaN(utc)) {
    return NaN;
  }
  let time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) + utc * 60000;
  if (!Number.isNaN(local) && utc - local > 12 * 60) {
    time -= DAY_MS;
  }
  return time;
}

const number = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * One row → one slot, or null when the row is unusable.
 * @returns {{ key: string, id: number, date: string, direction: 'down' | 'up', tag: string,
 *   test: boolean, from: number, to: number, mw: number, price: number } | null}
 */
export function parseRow(row) {
  const direction = Object.keys(DIRECTIONS).find(
    (key) => DIRECTIONS[key].toLowerCase() === String(row?.['Event Type'] ?? '').toLowerCase(),
  );
  const date = String(row?.['Delivery Date'] ?? '').slice(0, 10);
  const id = Number(row?.['Event ID']);
  const from = instant(date, row?.From_UTC, row?.From_Local);
  let to = instant(date, row?.To_UTC, row?.To_Local);
  if (!direction || !Number.isFinite(id) || Number.isNaN(from) || Number.isNaN(to)) {
    return null;
  }
  if (to <= from) {
    to += DAY_MS; // a slot ending at midnight
  }
  return {
    key: `${date}#${id}`,
    id,
    date,
    direction,
    tag: String(row['Event Tag'] ?? '').toLowerCase(),
    test: String(row['Service Requirement Type'] ?? '').toLowerCase() === 'test',
    from,
    to,
    mw: number(row['Service Requirement MW']),
    price: number(row['Guaranteed Acceptance Price GBP per MWh']),
  };
}
