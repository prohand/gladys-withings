# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

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

[Unreleased]: https://github.com/prohand/gladys-withings/commits/main
