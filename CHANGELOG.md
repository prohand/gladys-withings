# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

### Added

- Search keywords for the Gladys catalog (Health Mate, Body Cardio, ScanWatch, Sleep Analyzer…).

### Changed

- Gladys 5.3.0 or later is now required (the catalog keywords need it).
- `@gladysassistant/integration-sdk` updated to 0.16.0.

## [1.0.2] - 2026-10-23

- Maintenance release, no functional change.

## [1.0.1] - 2026-10-14

### Added

- Withings account connection with the OAuth2 "Connect" button, through your own Withings developer app.
- "Withings health" device: weight, body composition, blood pressure, heart rate, SpO2, body and skin temperature, pulse wave velocity, vascular age, today's activity and last night's sleep. Features follow what the account measures; measures keep their own date in the history.
- One device per battery-powered Withings device, with a "Battery low" feature.
- Real-time notifications through Gladys Plus, including the "in bed" / "out of bed" state of a Sleep Analyzer.
- Scene triggers: new measurement, got into bed, got out of bed, night summary available, steps goal reached.
- Scene actions: refresh Withings data, read the last Withings value.
- Dashboard widgets: "Withings health" summary and "Weight trend" chart.
- Configuration screen buttons: test the connection, synchronize now, disconnect the account.
- Cloud transport badge on every device.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/prohand/gladys-withings/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/prohand/gladys-withings/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-withings/releases/tag/v1.0.1
