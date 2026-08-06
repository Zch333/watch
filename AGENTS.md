# Repository Guidelines

## Project Structure & Module Organization

Move25 is a legacy HarmonyOS Lite Wearable FA application for HUAWEI WATCH GT 6. The runnable module is `entry/`; its current UI scaffold lives in `entry/src/main/js/MainAbility/` (`app.js` and `pages/index/`), with images and strings under `entry/src/main/resources/`. The planned implementation keeps dependencies flowing from `domain/` to `workflows/`, `ports/`, `adapters/`, `app/`, and `pages/`, with host tests in `tests-host/`. Root build metadata is in `build-profile.json5`, `hvigorfile.ts`, and `entry/build-profile.json5`. Treat `docs/move25_gt6_funar_docs/` as the active architecture and delivery source; `docs/后续延展，暂不考虑/` is explicitly out of scope.

## Build, Test, and Development Commands

- Open the repository in DevEco Studio with Lite SDK 6.1.1 (API 24), select product `default`, and use the `debug` build for emulator/device runs or `release` for packaging.
- Build, install, sign, and run through DevEco Studio’s built-in Hvigor integration; this repository does not include an `hvigorw` wrapper or npm scripts.
- Keep dependencies synchronized from `oh-package.json5` and `oh-package-lock.json5`; `@ohos/hypium` 1.0.25 is currently declared for development.

## Coding Style & Architecture

Use four spaces in JavaScript/HML and two spaces in CSS, matching the existing scaffold. Prefer small pure functions, ordinary records, immutable updates, tagged ADTs, and explicit `Result` values. `domain/` must not import `@ohos.*`, system APIs, UI code, storage, or the clock; effects belong behind ports and adapters. Do not use `setInterval` or long `setTimeout` for background reminders, and do not assume browser, Node, or modern ArkTS features in Lite JS.

## Testing Guidelines

No tests or coverage threshold exist yet. Add deterministic domain/workflow tests under `tests-host/`, using fixed time and in-memory/recording adapters; use Hypium where appropriate. Validate UI behavior in the Lite simulator, but require separate GT6 evidence before claiming background, screen-off, reboot, connectivity, or power behavior.

## Commit & Pull Request Guidelines

Follow the observed Conventional Commit style with a scope, for example `feat(domain): add schedule policy`, `fix(adapter): preserve semantic key`, or `docs(adr): record decision`. Use `main`, `feature/*`, `adapter/*`, `probe/*`, or `adr/*` branches. PRs should explain intent and affected layers, list build/test evidence, link related work, and include simulator/device screenshots for UI changes.

## Security & Configuration

Never commit signing keys, certificates, passwords, watch UDIDs, personal-data logs, or build output. Confirm platform APIs against the current Lite SDK and record uncertain device capabilities as probes or ADR-backed evidence.
