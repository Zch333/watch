# Architecture

## Functional DDD + FUNAR

```text
Compose/MVU · WorkManager · App Functions
                 |
            application
 commands -> decisions -> explicit effects -> events
                 |
              domain
 observation -> quality -> metric -> baseline -> insight -> report
                    \-> sedentary policy -> reminder effect
                 |
               ports
                 |
 Room/Keystore · DataStore/Notification · Huawei ACL · Wear Engine · ADK · export/backend
```

Dependencies point inward. `domain` contains immutable values and pure functions and imports no Android, Huawei, database, network, or model SDK. `application` coordinates ports without owning platform objects. Android, Huawei, and AI objects are translated at adapter boundaries.

## Bounded contexts

| Context | Source package | Invariant |
|---|---|---|
| Acquisition | `ports`, `adapter-huawei` | Unsupported and approval states remain visible |
| Consent & Capability | `domain/Activation.kt`, consent ports | No collection without release, evidence, user, and purpose gates |
| Health Ledger | `Observation.kt`, Room stores | Append-only provenance and idempotent platform identity |
| Quality | `Quality.kt` | Rejected inputs never reach metrics or reminders |
| Metrics & Baseline | `Metrics.kt`, `FeatureEngineering.kt`, `Baseline.kt` | Version, input hash, evidence, and quality travel with every metric |
| Sedentary Reminder | `SedentaryReminder.kt`, reminder ports/use cases/adapters | Missing, ambiguous, stale, or unauthorized evidence never produces a reminder |
| Insight & Intervention | `Insight.kt`, `Intervention.kt` | Correlation is not causation; actions remain low risk |
| AI Explanation | `Ai.kt`, ADK adapters | LLM explains validated summaries and is not the detector |
| Research Governance | `Features.kt`, `Activation.kt` | L3/L4 features are independently gated and dormant |

The sedentary context follows the FUNAR transition shape `state + command -> events + effects`, with `evolve(state, event)` as its only state transition. DataStore, local time, permission, notification publication, and WorkManager are outbound adapters behind ports. The Compose panel is an inbound adapter that emits UI actions.

## Runtime data planes

1. Historical health data: GT6 -> Huawei Health -> approved Health Service Kit catalog -> Android anti-corruption layer.
2. Near-real-time reminder data: approved `activity` records -> local ledger -> qualified continuous-bout evidence -> pure reminder decision -> Android notification adapter.
3. Short live sessions and device communication: GT6 API 20 <-> Wear Engine P2P <-> Android.
4. Cloud: optional pinned own backend or Firebase AI Logic; raw waveforms are excluded by design.

The default composition uses `UnlinkedHuaweiNativeClient`. An approved native client is injected only after official artifacts, exact scopes, and device evidence exist.

## Activation

`HEALTH_RELEASE_ENABLED && userEnabled && every ReleaseEvidence field`

is required before background sync, Huawei authorization, device probes, live sessions, or AI. AI and App Functions each have an additional purpose consent and user switch. The sedentary reminder additionally requires its own user setting, active `health:activity` consent, qualified fresh evidence, and notification permission. Research has a separate release flag and evidence model. Checked-in release values remain false.
