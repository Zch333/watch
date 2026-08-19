# Repository Guidelines

## Scope, Structure & Sources of Truth

Move25 has two active bounded contexts. The Lite Wearable rhythm assistant is under `entry/src/main/js/MainAbility/`: pure rules in `domain/`, contracts in `ports/`, effects in `adapters/`, orchestration in `app/`, screens in `pages/`, and Node tests in `tests-host/`. HealthWeave spans the embedded `health-monitoring/` core and the modular Kotlin/Compose application in `health-android16/`.

Use `docs/move25_gt6_funar_docs/` and `docs/health-monitoring/HealthWeave_GT6_FUNAR_docs/` as design baselines; `docs/status/CURRENT_STATE.md` records evidence. Plans, host tests, and compiled code do not prove device behavior.

## Architecture & Change Strategy

Follow Functional Core + Imperative Shell. Keep scheduling, health rules, thresholds, and transitions pure, immutable, and deterministic. Place storage, clocks, Huawei APIs, network, AI, and navigation behind ports; domain code imports no platform or UI APIs.

Keep rhythm and health permissions, consent, data, and workflows separate. Model complex rule or integration changes explicitly; use surgical, style-matching edits for simple UI or configuration work. Never emulate background execution with `setInterval` or long `setTimeout`.

## Build, Test & Development Commands

- `npm test` — run deterministic Lite host tests.
- `npm run verify:toolchain` — validate the portable Lite build bridge.
- `npm run verify:release` — enforce release and security invariants.
- `cd health-android16 && bash tools/validate-source.sh` — check Android architecture.
- `cd health-android16 && node --test lite-companion-contract/protocol.test.mjs` — test the watch/phone protocol.

Build Lite through DevEco Studio with Lite SDK 6.1.1 (API 24) and product `default`. Use Android Studio for Android builds. No `hvigorw` or Gradle wrapper is committed.

## Style, Errors & Testing Evidence

Use four spaces in JavaScript/HML, two in CSS, and existing Kotlin formatting. Prefer small functions, immutable records, tagged values, explicit `Result` outcomes, kebab-case JavaScript filenames, and `*.test.mjs` tests. Fail fast at effect boundaries; never swallow exceptions. Sanitize errors and log key transitions without secrets or personal data. DevEco rules live in `code-linter.json5`.

Use fixed time and in-memory or recording adapters. No numeric coverage target exists; preserve contract and architecture-fitness tests. Distinguish host/static checks, simulator evidence, and GT6 evidence. Device-behavior claims require device results. Keep health release gates closed until documented evidence exists.

## Change Workflow, Commits & Security

Before editing, read relevant design/status files, inspect `git status`, define success criteria, and preserve unrelated work. Touch only necessary files. Update active documentation when contracts or verified evidence change; record uncertainty as a probe or ADR.

Use scoped Conventional Commits such as `feat(domain): ...`, `fix(adapter): ...`, or `docs(adr): ...`. PRs must state intent, affected boundaries, and verification evidence; include UI screenshots when applicable. Never commit signing material, credentials, watch UDIDs, personal-data logs, secrets, or build output.
