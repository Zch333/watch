# Test plan

## Source-only checks delivered now

- Kotlin domain tests: activation, quality, timeline idempotence, provenance, algorithms, baselines,
  AI safety and watch protocol.
- Application tests: pure workflow gates, route selection and Huawei normalization.
- Contract tests: repeated platform sync, cursor and audit behavior with recording adapters.
- Lite JavaScript tests: checksum, tamper/replay, wire ceiling and immutable ring buffer.
- Fitness script: layer imports, dormant defaults, App Functions defaults, bounded background model,
  secret patterns and forbidden GT6 API 24 imports.

## Deferred because the user requested no environment build

- Gradle dependency resolution, Kotlin/KSP/Room/App Functions compilation and lint.
- Robolectric/instrumented Room, Keystore, WorkManager, App Functions and Compose tests.
- Huawei approved SDK contract suite, authorization UI and every data group probe.
- Android 16 phone/emulator interaction and Gemini Nano device capability/download.
- GT6 real-device screen-off/reboot/disconnect/power evidence.

Those are release blockers, not presumed passes.
