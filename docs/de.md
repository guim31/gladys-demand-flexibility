# NESO Demand Flexibility

Die Ereignisse des **Demand Flexibility Service** (DFS) von NESO, dem
Betreiber des britischen Stromsystems: halbe Stunden, in denen Haushalte und
Unternehmen, die über ihren Versorger angemeldet sind („Saving Sessions“ von
Octopus und andere), Geld dafür bekommen, ihren Verbrauch zu ändern. Die Daten
stammen aus dem offenen [NESO-Datenportal](https://www.neso.energy/data-portal/demand-flexibility).
Diese Integration ist nicht mit NESO verbunden, auch mit keinem Versorger.

## Überblick

NESO veröffentlicht zwei Arten von Ereignissen, jede als ein Gerät:

- **Senken** („senken“): während des Ereignisses weniger Strom verbrauchen —
  die üblichen, hinter den „Saving Sessions“;
- **Erhöhen** („erhöhen“): mehr verbrauchen, wenn das Netz zu viel Strom hat
  (seltener).

Die Ereignisse werden am selben Tag angekündigt, meist zwischen 10 und 13 Uhr,
für Nachmittag und Abend (zum Beispiel 16:00–20:00). Jedes Gerät zeigt, ob ein
Ereignis läuft, das nächste und die Zahl der angekündigten. Ein Widget, drei
Szenen-Auslöser und eine Szenen-Aktion helfen, Waschmaschine, Autoladung oder
Heizung zu verschieben.

Ob **dein** Haushalt Geld bekommt, hängt von deinem Versorger und deiner
Teilnahme bei ihm ab: Die Integration sagt nur, was NESO angefordert hat.

## Voraussetzungen

- Gladys Assistant 5.3.0 oder neuer.
- Gladys muss `api.neso.energy` im Internet erreichen. Kein Konto, kein
  Schlüssel: Die Daten sind offen, unter der NESO Open Data Licence.
- Der Dienst deckt Großbritannien ab (England, Schottland, Wales).

## Konfiguration

1. Installiere die Integration (**Integrationen → Von GitHub installieren**,
   dann `https://github.com/guim31/gladys-demand-flexibility`).
2. Im Tab **Konfiguration**:
   - **Sprache der Namen**: Sprache der Geräte- und Funktionsnamen (beim
     Hinzufügen festgelegt) und der Texte für Szenen;
   - **Ereignisse zum Stromsparen**: standardmäßig an;
   - **Ereignisse zum Mehrverbrauch**: standardmäßig aus.
3. Speichere und füge die Geräte im Tab **Erkennung** hinzu.

### Schaltfläche „Verbindung testen“

Liest sofort das NESO-Datenportal und zeigt die Zahl der angekündigten
Ereignisse und das nächste, oder den Fehler in Rot.

## Geräte

### DFS-Flexibilität (eines pro Ereignisart)

| Funktion                        | Wert                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| Ereignis läuft                  | 1 während eines Ereignisses, sonst 0                             |
| Anstehende Ereignisse           | angekündigte, noch nicht begonnene Ereignisse                    |
| Beginn des nächsten Ereignisses | Tag und Uhrzeit, zum Beispiel `Sa., 21.11. 16:00`, oder „keines“ |
| Ende des nächsten Ereignisses   | Uhrzeit, zum Beispiel `20:00`                                    |
| Garantierter Preis (£/MWh)      | der von NESO garantierte Annahmepreis, 0 wenn keiner             |

„Nächstes Ereignis“ ist das laufende, sonst das folgende. NESO setzt selten
einen garantierten Preis; was dein Versorger zahlt, wird nicht veröffentlicht.

## Widget

**Nächstes DFS-Ereignis** zeigt für die in den Einstellungen gewählte Art
(standardmäßig die erste): das laufende Ereignis und sein Ende, oder das
nächste und die Zeit bis zum Beginn, den garantierten Preis, falls vorhanden,
die weiteren anstehenden Ereignisse und das letzte beendete. Zwei Einstellungen
blenden die anstehenden und das letzte Ereignis aus.

## Szenen

### Neues Ereignis angekündigt (Auslöser)

Löst aus, wenn NESO ein noch nicht gesehenes Ereignis veröffentlicht. Filter:
die Ereignisart. Variablen: `day`, `start_time`, `end_time`,
`duration_minutes`, `minutes_until`, `price`. Ereignisse, die beim allerersten
Start der Integration schon veröffentlicht sind, lösen ihn nicht aus.

### Ereignis beginnt bald (Auslöser)

Löst einmal pro Ereignis und gewählter Vorwarnzeit aus: 5, 15, 30 Minuten,
1 oder 2 Stunden vor dem Beginn. Ein spät angekündigtes Ereignis löst die schon
verstrichenen Vorwarnzeiten auf einmal aus. Filter: die Ereignisart, die
Vorwarnzeiten. Variablen: `start_time`, `end_time`, `duration_minutes`,
`minutes_until`, `price`.

### Ereignis beendet (Auslöser)

Löst einmal am Ende jedes Ereignisses aus (innerhalb von zwei Stunden). Filter:
die Ereignisart. Variablen: `start_time`, `end_time`, `duration_minutes`.

### Nächstes Ereignis abrufen (Aktion)

Gibt das laufende oder nächste Ereignis an die folgenden Aktionen weiter:
`day`, `start_time`, `end_time`, `minutes_until`, `duration_minutes`,
`in_progress` (1 oder 0) und `price`. Schlägt in Rot fehl, wenn kein Ereignis
angekündigt ist.

## Szenen-Beispiele

- **Neues Ereignis angekündigt** → schick dir „Saving Session heute:“ mit
  `start_time` und `end_time` aus der Variablenliste.
- **Ereignis beginnt bald** (30 Minuten) → Warmwasserbereiter aus und Heizung
  absenken; **Ereignis beendet** → wieder zurück.
- **Ereignis beginnt bald** bei Erhöhen-Ereignissen → die Ladung des
  Elektroautos starten.

## Grenzen

- Die Integration liest das Portal alle 10 Minuten (eine kleine Abfrage), nur
  wenn ein Gerät hinzugefügt ist oder das Widget angezeigt wird. NESO bittet um
  höchstens 1 Anfrage pro Sekunde an seine API und 2 pro Minute an seinen
  Datastore: weit über dieser Nutzung.
- Auch die seltenen Testereignisse von NESO (etwa eine Stunde, wenige im
  Jahr) erscheinen und lösen die Szenen aus wie die anderen.
- NESO veröffentlicht die geplanten Ereignisse; es kann eines absagen oder
  ändern, was die nächste Abfrage zeigt.
- Ist das Portal nicht erreichbar, behalten die Geräte die zuletzt gelesenen
  Ereignisse (ein Ereignis beginnt und endet trotzdem pünktlich), und die
  Konfigurationsseite meldet es.
- Die Uhrzeiten stehen in der Zeitzone von Gladys.
- Entwickelt und getestet gegen das echte NESO-Datenportal, noch nicht in einem
  teilnehmenden Haushalt: Rückmeldungen sind willkommen.

## Fehlerbehebung

- **Kein Gerät in der Erkennung**: Keine Ereignisart wird verfolgt; wähle eine
  in der Konfiguration.
- **„Das NESO-Datenportal ist gerade nicht erreichbar“**: Prüfe den
  Internetzugang von Gladys und nutze dann **Verbindung testen**.
- **Tagelang kein Ereignis**: NESO ruft nur Ereignisse aus, wenn das Netz sie
  braucht; das Widget zeigt das letzte.
- Protokolle: Die Integration protokolliert ihren Start, neue Ereignisse und
  Fehler. Für mehr Details setze die Umgebungsvariable `LOG_LEVEL=debug`.

## Danksagung

Daten: NESO-Datenportal, Datensatz „Demand Flexibility Service“, NESO Open Data
Licence — „Supported by National Energy System Operator open data“. Diese
Integration ist nicht mit NESO verbunden.
