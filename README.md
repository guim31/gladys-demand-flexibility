# NESO Demand Flexibility for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for the events of
the **Demand Flexibility Service** (DFS) of NESO, Great Britain's National
Energy System Operator: the half-hours when households and businesses signed up
through their supplier (Octopus "Saving Sessions" and others) are paid to use
less electricity — or, more rarely, more.

The events come from the open
[NESO Data Portal](https://www.neso.energy/data-portal/demand-flexibility): no
account, no key.

## What it does

- One device per kind of event followed (turn-down by default, turn-up as an
  option): event in progress, number of upcoming events, start and end of the
  next one, guaranteed acceptance price.
- Scene triggers: **New event announced**, **Event starts soon** (5, 15, 30
  minutes, 1 or 2 hours before), **Event ended**.
- Scene action **Get the next event**, for the following actions of a scene.
- Dashboard widget **Next DFS event**: the event in progress or the next one,
  the upcoming ones and the last one over.
- Texts and documentation in English, French, German and Spanish
  ([`docs/`](docs/en.md)).

## Requirements

- Gladys Assistant 5.3.0 or later, with internet access to `api.neso.energy`.
- Being paid for an event depends on your supplier: the integration only says
  what NESO asked for.

## Installation

In Gladys: **Integrations → Install from GitHub**, then
`https://github.com/guim31/gladys-demand-flexibility`. Choose the kinds of
events in the **Configuration** tab, then add the devices from **Discovery**.

## How it works

- The dataset `demand-flexibility` has a resource **DFS Service Requirement**:
  one row per half-hour slot of every event announced (delivery date, local and
  UTC times, `Downwards`/`Upwards`, MW, guaranteed price). Rows sharing a date
  and an Event ID form an event.
- The integration reads the last 14 days of that resource with one
  `datastore_search_sql` query every 10 minutes, only when a device is added
  or the widget is shown, and retries a failure after 5 minutes. NESO asks for
  no more than 1 request per second (CKAN API) and 2 per minute (datastore).
- NESO moves each season to an "(Archive …)" resource: when the query fails,
  the current resource is looked up again by name (`package_show`), at most
  once an hour.
- The devices declare no poll frequency: the container ticks every minute on
  its own timer, publishes only the states that change (each re-sent every 6
  hours) and fires the triggers, remembered under `/data`.

## Checked, and what was not

Checked: the test suite (the SDK's fake Gladys, a fake portal serving **real
answers** recorded on 22/11/2026: the events of 16–22/11, a period without
events, a summer event in British Summer Time), the conformity test against
the core's table of category/type couples, the store validator, and the Docker
image started with the Gladys sandbox constraints, reading the real portal from
inside the locked container.

Not checked: a real Gladys instance (the dashboard rendering of the widget,
the scene editor), and a household taking part in the service. Feedback
welcome.

## Limitations

- The integration shows the events NESO published; NESO can cancel or change
  one, which the next reading (10 minutes) shows.
- NESO rarely sets a guaranteed price, and what a supplier pays its customers
  is not published.
- Axle Energy, also listed as a source of demand flexibility events, publishes
  no open data without an account: not supported.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

See [`CLAUDE.md`](CLAUDE.md) for the project rules. Versions, images and
releases belong to the Release workflow (Actions → Release).

## Credits

- [NESO](https://www.neso.energy) and its Data Portal: "Demand Flexibility
  Service" dataset, under the
  [NESO Open Data Licence](https://www.neso.energy/data-portal/neso-open-licence)
  — "Supported by National Energy System Operator open data".
- Cover: the NESO logo, from [neso.energy](https://www.neso.energy), a trademark
  of NESO, shown to name the data source.
- The architecture, the conformity and language tests follow
  [gladys-carbon-intensity-uk](https://github.com/guim31/gladys-carbon-intensity-uk)
  and [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by NESO, nor by any
energy supplier. Its data stay subject to the NESO Open Data Licence.

## License

[Apache-2.0](LICENSE).
