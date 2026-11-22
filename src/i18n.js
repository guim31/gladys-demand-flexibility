// -----------------------------------------------------------------------------
// Every text the integration shows, in the four languages of the Gladys
// interface (en, fr, de, es). German says "du", Spanish says "usted", like the
// rest of guim31's integrations. Brands (NESO, DFS) stay as they are.
//
//   - NAMES    : device and feature names, written once in the language of
//                the configuration (Gladys freezes them when a device is added);
//   - TEXT     : the fixed texts (widget, configuration screen, actions);
//   - MESSAGES : the texts built from a value.
//
// test/i18n.test.js checks that every entry carries exactly the four
// languages, with no empty text and no polite German.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

export { LANGUAGES };

/** A multi-language object → the text of one language (English as fallback). */
export function pick(text, language) {
  return text[language] ?? text.en;
}

const each = (build) => Object.fromEntries(LANGUAGES.map((lang) => [lang, build(lang)]));

/**
 * The error of a failed action or scene action: Gladys shows it in red, in
 * the user's language, because the message is the multi-language object.
 */
export class ActionFailure extends Error {
  /** @param {Record<string, string>} text */
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}

/** Device and feature names, by language then key. */
export const NAMES = {
  en: {
    device_down: 'Demand Flexibility (reduce)',
    device_up: 'Demand Flexibility (increase)',
    active: 'Event in progress',
    upcoming_count: 'Upcoming events',
    next_start: 'Next event start',
    next_end: 'Next event end',
    next_price: 'Guaranteed price (£/MWh)',
    none: 'None announced',
  },
  fr: {
    device_down: 'Flexibilité DFS (réduire)',
    device_up: 'Flexibilité DFS (augmenter)',
    active: 'Événement en cours',
    upcoming_count: 'Événements à venir',
    next_start: 'Début du prochain événement',
    next_end: 'Fin du prochain événement',
    next_price: 'Prix garanti (£/MWh)',
    none: 'Aucun annoncé',
  },
  de: {
    device_down: 'DFS-Flexibilität (senken)',
    device_up: 'DFS-Flexibilität (erhöhen)',
    active: 'Ereignis läuft',
    upcoming_count: 'Anstehende Ereignisse',
    next_start: 'Beginn des nächsten Ereignisses',
    next_end: 'Ende des nächsten Ereignisses',
    next_price: 'Garantierter Preis (£/MWh)',
    none: 'Keines angekündigt',
  },
  es: {
    device_down: 'Flexibilidad DFS (reducir)',
    device_up: 'Flexibilidad DFS (aumentar)',
    active: 'Evento en curso',
    upcoming_count: 'Eventos próximos',
    next_start: 'Inicio del próximo evento',
    next_end: 'Fin del próximo evento',
    next_price: 'Precio garantizado (£/MWh)',
    none: 'Ninguno anunciado',
  },
};

export const TEXT = {
  // Widget tiles: labels of 24 characters at most, values of 12.
  inProgressUntil: {
    en: 'In progress until',
    fr: "En cours jusqu'à",
    de: 'Läuft bis',
    es: 'En curso hasta',
  },
  nextOn: { en: 'Next:', fr: 'Prochain :', de: 'Nächstes:', es: 'Próximo:' },
  nextEvent: {
    en: 'Next event',
    fr: 'Prochain événement',
    de: 'Nächstes Ereignis',
    es: 'Próximo evento',
  },
  startsIn: { en: 'Starts in', fr: 'Commence dans', de: 'Beginnt in', es: 'Empieza en' },
  endsIn: { en: 'Ends in', fr: 'Se termine dans', de: 'Endet in', es: 'Termina en' },
  price: {
    en: 'Guaranteed price',
    fr: 'Prix garanti',
    de: 'Garantierter Preis',
    es: 'Precio garantizado',
  },
  lastEvent: { en: 'Last event:', fr: 'Dernier :', de: 'Letztes:', es: 'Último:' },
  noneShort: { en: 'None', fr: 'Aucun', de: 'Keines', es: 'Ninguno' },
  // Messages.
  noDevice: {
    en: 'Follow at least one kind of event in the configuration of the integration.',
    fr: "Suivez au moins un type d'événement dans la configuration de l'intégration.",
    de: 'Verfolge mindestens eine Art von Ereignis in der Konfiguration der Integration.',
    es: 'Siga al menos un tipo de evento en la configuración de la integración.',
  },
  waiting: {
    en: 'Waiting for the first reading of the NESO data…',
    fr: 'En attente de la première lecture des données de NESO…',
    de: 'Warte auf die erste Abfrage der NESO-Daten…',
    es: 'Esperando la primera lectura de los datos de NESO…',
  },
  unreachable: {
    en: 'The NESO Data Portal cannot be reached right now.',
    fr: 'Le portail de données de NESO est injoignable pour le moment.',
    de: 'Das NESO-Datenportal ist gerade nicht erreichbar.',
    es: 'El portal de datos de NESO no está disponible en este momento.',
  },
  unknownDevice: {
    en: 'Unknown device: choose one of the devices of the integration.',
    fr: "Appareil inconnu : choisissez un des appareils de l'intégration.",
    de: 'Unbekanntes Gerät: Wähle eines der Geräte der Integration.',
    es: 'Dispositivo desconocido: elija uno de los dispositivos de la integración.',
  },
  noEvent: {
    en: 'No event announced by NESO for this kind.',
    fr: 'Aucun événement annoncé par NESO pour ce type.',
    de: 'Kein Ereignis dieser Art von NESO angekündigt.',
    es: 'Ningún evento anunciado por NESO para este tipo.',
  },
  initFailed: {
    en: 'Initialization failed: see the logs of the integration.',
    fr: "Échec de l'initialisation : voir les journaux de l'intégration.",
    de: 'Initialisierung fehlgeschlagen: siehe die Protokolle der Integration.',
    es: 'Fallo de la inicialización: consulte los registros de la integración.',
  },
};

/** Direction names, for messages. */
export const DIRECTION_TEXT = {
  down: { en: 'reduce', fr: 'réduire', de: 'senken', es: 'reducir' },
  up: { en: 'increase', fr: 'augmenter', de: 'erhöhen', es: 'aumentar' },
};

export const MESSAGES = {
  /** Test action, success. */
  reached: (count, next) =>
    each((lang) => {
      const head = {
        en: `NESO reached: ${count} upcoming event(s)`,
        fr: `NESO joint : ${count} événement(s) à venir`,
        de: `NESO erreicht: ${count} anstehende(s) Ereignis(se)`,
        es: `NESO alcanzado: ${count} evento(s) próximo(s)`,
      }[lang];
      if (!next) {
        return head;
      }
      const label = { en: 'next:', fr: 'prochain :', de: 'nächstes:', es: 'próximo:' }[lang];
      return `${head}, ${label} ${next[lang]}`;
    }),
  /** Test action, failure. */
  unreachable: (cause) =>
    each((lang) => `${pick(TEXT.unreachable, lang)} (${String(cause).slice(0, 80)})`),
  updatedAt: (time) =>
    each(
      (lang) =>
        ({
          en: `NESO data read at ${time}`,
          fr: `Données NESO lues à ${time}`,
          de: `NESO-Daten gelesen um ${time}`,
          es: `Datos de NESO leídos a las ${time}`,
        })[lang],
    ),
};

/** "17:30" in the time zone of Gladys (TZ), 24-hour clock in every language. */
export function clockTime(ms, timeZone) {
  return new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  });
}

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** "sam. 21/11" (fr), "Sat 21/11" (en): the day of an event. */
export function dayText(ms, language, timeZone) {
  return new Date(ms).toLocaleDateString(LOCALES[language] ?? 'en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });
}

/** "sam. 21/11 16:00": the start of an event. */
export const dayTime = (ms, language, timeZone) =>
  `${dayText(ms, language, timeZone)} ${clockTime(ms, timeZone)}`;

/** "sam. 21/11 16:00–20:00": an event, in every language. */
export const eventText = (event, timeZone) =>
  each((lang) => `${dayTime(event.start, lang, timeZone)}–${clockTime(event.end, timeZone)}`);

/** 200 → "3 h 20", 45 → "45 min", 1600 → "27 h" (language-neutral). */
export function durationText(minutes) {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  if (minutes < 10 * 60) {
    const rest = minutes % 60;
    return `${Math.floor(minutes / 60)} h${rest ? ` ${String(rest).padStart(2, '0')}` : ''}`;
  }
  return `${Math.round(minutes / 60)} h`;
}
