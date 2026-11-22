// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined` or with a value typed by hand.
//
// NESO publishes two kinds of Demand Flexibility Service events:
//   - "Downwards" (turn-down): households and businesses are paid to use LESS
//     electricity — the events behind the suppliers' "saving sessions";
//   - "Upwards" (turn-up): paid to use MORE, when there is too much power.
// Each kind followed is one device.
// -----------------------------------------------------------------------------

/** The languages of the Gladys interface, every text exists in all four. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** Direction key (frozen: device ids and scene data use it) → NESO "Event Type". */
export const DIRECTIONS = { down: 'Downwards', up: 'Upwards' };

/** Warnings offered by the "starts soon" trigger, in minutes (frozen keys). */
export const LEADS = ['5', '15', '30', '60', '120'];

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // Language of the device and feature names (frozen when a device is added)
  // and of the texts the container produces where Gladys does not say the
  // user's language (scene events, text states, action messages).
  language: 'fr',
  follow_down: true,
  follow_up: false,
};

const toBoolean = (value, fallback) =>
  value === undefined || value === null || value === ''
    ? fallback
    : value === true || value === 'true' || value === 1 || value === '1';

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const language = String(raw.language ?? DEFAULT_CONFIG.language);
  const followDown = toBoolean(raw.follow_down, DEFAULT_CONFIG.follow_down);
  const followUp = toBoolean(raw.follow_up, DEFAULT_CONFIG.follow_up);
  return {
    language: LANGUAGES.includes(language) ? language : DEFAULT_CONFIG.language,
    directions: [...(followDown ? ['down'] : []), ...(followUp ? ['up'] : [])],
  };
}
