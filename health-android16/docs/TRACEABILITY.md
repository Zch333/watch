# Requirements traceability

| Planned capability | Implementation | Default/runtime guard | Verification |
|---|---|---|---|
| Android-first local ledger | Room entities/stores + Keystore AES-256-GCM | release/user/evidence gate | storage contract + Android instrumentation later |
| Activity and sedentary monitoring | `activity` plan/algorithm + qualified timeline observations | scope + quality + freshness | feature tests + evidence tests |
| Sedentary reminder | functional aggregate, use cases, DataStore, WorkManager, notification adapter, Compose MVU panel | release/user/evidence + `health:activity` consent + user switch + quiet/snooze/cooldown + notification permission | domain/application tests + source fitness check |
| Sedentary false-positive control | continuous-bout interval coverage; daily aggregate/missing/stale/rejected data excluded | fail-closed evidence derivation | aggregate rejection + quality/movement tests |
| Heart rate/RHR | historical algorithm + real-time port | consent, 5-minute live bound | feature + adapter contract |
| Sleep duration/regularity/stage display | sleep normalizer/algorithm | approved catalog; vendor stage retained | deterministic tests |
| SpO2 | median/min/threshold count | capability and quality | feature tests |
| Stress | vendor trend + recovery input | explicitly vendor-unverified evidence | provenance assertions |
| Temperature | skin/body trends remain distinct | capability gate | type/normalizer tests |
| HRV/PRV | RRI RMSSD / PPG PRV | minimum 30 intervals; PRV research-only | algorithm tests |
| Respiration | median trend | approved catalog | feature registry test |
| Workout/training load/HR recovery | deterministic algorithms | required inputs/quality | algorithm tests |
| GPS route | validated coordinates + Haversine/pace | location scope + route review | normalizer/domain tests |
| VO2max | vendor median | vendor capability only | registry/source checks |
| Baseline/change point/anomaly | median/MAD, persistence, change point | minimum history | baseline tests |
| Recovery index | explainable available-component score | at least two components | feature tests |
| Mood/female health | manual categorical entries | separate manual-entry consent | use-case tests |
| Blood pressure/glucose | validated external/manual entries only | no GT6 measurement claim | semantic tests |
| Daily/weekly/monthly report | deterministic `HealthReport` + UI | activation and qualified metrics | report tests |
| N-of-1/intervention | immutable plan/transitions and before/after analysis | non-causal limitation | domain tests |
| AI explanation | ADK Nano/Firebase/backend ports | activation + AI consent + validation | AI safety tests |
| Android 16 App Functions | aggregated summary only | annotation false + runtime gate + consent | source fitness check |
| GT6 companion | v1 checksum/replay/buffer contract | API 20, 1 KiB, explicit short session | Kotlin + JS protocol tests |
| Export/delete/revoke | JSON/FHIR research export, tombstones, cloud delete port | research consent / explicit confirmation | contract tests |
| Low power | WorkManager constraints and bounded sessions | no timers/services/passive sensor opens | source fitness check |

`RESEARCH_ONLY` and `REGULATED_ONLY` entries are implemented as truthful domain states and gates, not enabled consumer features. Arrhythmia, sleep-apnoea, fall detection, and disease/medication claims cannot be activated by the normal product switch.
