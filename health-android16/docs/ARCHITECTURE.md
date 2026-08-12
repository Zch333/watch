# Architecture

## Functional DDD + FUNAR

```text
Compose/MVU · WorkManager · AppFunctions
                 |
            application
 Commands -> decisions -> explicit effects -> events
                 |
              domain
 observation -> quality -> metric -> baseline -> insight -> report
                 |
               ports
                 |
 Room/Keystore · Huawei ACL · Wear Engine · ADK · export/backend
```

Dependencies point inward. `domain` contains immutable values and pure functions and imports no
Android, Huawei, database, network or model SDK. `application` coordinates ports without owning
platform objects. Android/Huawei/AI objects are translated at adapter boundaries.

## Bounded contexts

| Context | Source package | Invariant |
|---|---|---|
| Acquisition | `ports`, `adapter-huawei` | Unsupported/approval states remain visible |
| Consent & Capability | `domain/Activation.kt`, consent ports | No collection without release, evidence, user and purpose gates |
| Health Ledger | `Observation.kt`, Room stores | Append-only provenance; idempotent platform identity |
| Quality | `Quality.kt` | Rejected inputs never reach derived metrics |
| Metrics & Baseline | `Metrics.kt`, `FeatureEngineering.kt`, `Baseline.kt` | Version, input hash, evidence and quality always travel with a metric |
| Insight & Intervention | `Insight.kt`, `Intervention.kt` | Correlation is not causation; actions are low risk |
| AI Explanation | `Ai.kt`, ADK adapters | LLM explains validated summaries and cannot be the detector |
| Research Governance | `Features.kt`, `Activation.kt` | L3/L4 features are independently gated and dormant |

## Runtime data planes

1. Historical health data: GT6 → Huawei Health → approved Health Service Kit catalog → Android ACL.
2. Short live sessions/device communication: GT6 API 20 ↔ Wear Engine P2P ↔ Android.
3. Cloud: optional pinned own backend or Firebase AI Logic; raw waveforms are excluded by design.

The default composition uses `UnlinkedHuaweiNativeClient`. An approved native client is injected
only after official AARs, exact scopes and device evidence exist. This makes an unverified Huawei
symbol impossible to masquerade as support.

## Activation

`HEALTH_RELEASE_ENABLED && userEnabled && every ReleaseEvidence field`

is required before background sync, Huawei authorization, device probes, live sessions or AI. AI
and App Functions each have an additional purpose consent and user switch. Research has a separate
release flag/evidence model. All checked-in values are false.
