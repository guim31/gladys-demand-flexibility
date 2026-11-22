# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- First version: the Demand Flexibility Service events of NESO (Great Britain),
  read from the open NESO Data Portal, without account or key.
- One device per kind of event followed (turn-down by default, turn-up as an
  option): event in progress, number of upcoming events, start and end of the
  next one, guaranteed price.
- Scene triggers "New event announced", "Event starts soon" (5 minutes to
  2 hours before) and "Event ended"; scene action "Get the next event".
- Dashboard widget "Next DFS event": the event in progress or the next one,
  the upcoming ones and the last one.
- Texts and documentation in English, French, German and Spanish.
