# Repository Guidelines

## Project Structure & Module Organization

Move25’s primary runnable target is the HarmonyOS Lite Wearable FA module in `entry/`. Application code lives under `entry/src/main/js/MainAbility/`: pure rules in `domain/`, effect contracts in `ports/`, platform and test implementations in `adapters/`, orchestration in `app/`, and HML/JS/CSS screens in `pages/`. Host tests are in `tests-host/`; strings and images are in `entry/src/main/resources/`. `health-android16/` is a separate Kotlin/Compose companion organized as domain, ports, application, adapters, contract tests, and app modules. Treat `docs/move25_gt6_funar_docs/` and `docs/health-monitoring/HealthWeave_GT6_FUNAR_docs/` as active design sources; `docs/status/CURRENT_STATE.md` is the current evidence record.

## Build, Test, and Development Commands

- `npm test` — runs all deterministic Lite host tests through `tests-host/run.mjs`.
- `npm run verify:toolchain` — checks the portable Lite build bridge and generated-path safety.
- `npm run verify:release` — enforces bundle, permission, page, timer, network, and signing-material release invariants.
- `cd health-android16 && bash tools/validate-source.sh` — performs Android source-level architecture checks.
- `cd health-android16 && node --test lite-companion-contract/protocol.test.mjs` — verifies the watch/phone protocol.

Build, sign, install, and run the Lite app through DevEco Studio with Lite SDK 6.1.1 (API 24), product `default`, and `debug` or `release`. There is no `hvigorw` wrapper. Use Android Studio for full Android/Gradle builds; no Gradle wrapper is committed.

## Coding Style & Architecture

Use four spaces in JavaScript/HML and two in CSS; follow existing Kotlin formatting. Prefer small pure functions, immutable records, tagged values, and explicit `Result` outcomes. `domain/` must not import UI, storage, clocks, or platform APIs; place effects behind ports and adapters. Use kebab-case JavaScript filenames and `*.test.mjs` tests. Never emulate background work with `setInterval` or long `setTimeout`. DevEco lint rules are defined in `code-linter.json5`.

## Testing Guidelines

There is no numeric coverage threshold. Add fixed-time tests with in-memory or recording adapters and preserve architecture fitness tests. Validate UI in the Lite simulator, but require separate GT6 evidence before claiming screen-off, reboot, vibration, connectivity, or power behavior.

## Commit & Pull Request Guidelines

Use scoped Conventional Commits, such as `feat(domain): add schedule policy`, `fix(adapter): preserve semantic key`, or `docs(adr): record decision`. PRs must explain intent and affected layers, link related work, list commands and device evidence, and include screenshots for UI changes.

## Security & Configuration

Never commit signing keys, certificates, passwords, watch UDIDs, personal-data logs, secrets, or build output. Record uncertain platform capabilities as probes or ADR-backed evidence rather than assumptions.
