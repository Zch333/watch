# Sedentary reminder bounded context

## Scope

The sedentary reminder is a consumer-wellness feature inside the Android 16 app. It does not diagnose disease and it does not infer inactivity from missing data. The feature is disabled by default and remains dormant until the product release evidence, the user health switch, the activity consent, and the reminder switch are all active.

## FUNAR and Functional DDD model

The bounded context is an immutable functional core:

- `SedentaryReminderCommand` represents `Check`, `Snooze`, `MarkDelivered`, and `Reset` requests.
- `decideSedentaryReminder` is a pure decision function returning next state, domain events, and declarative effects.
- `evolveSedentaryReminder` is the only state transition function.
- `SedentaryReminderEffect.PublishReminder` describes notification intent without importing Android APIs.

The aggregate never reads time, permissions, persistence, Huawei APIs, or WorkManager directly. External facts enter through `SedentaryCheckInput`.

## Hexagonal boundaries

| Layer | Responsibility |
|---|---|
| `domain/SedentaryReminder.kt` | Immutable policy, commands, events, effects, state evolution, evidence qualification |
| `ports/SedentaryReminderPorts.kt` | Settings, state, local time, notification permission, scheduling ports |
| `application/SedentaryReminderUseCases.kt` | Preflight, timeline query, effect execution, persistence, audit, configuration, snooze |
| `adapter-android/Sedentary*.kt` | DataStore, system time zone, notification permission, notification publication, WorkManager |
| `app/ui/SedentaryReminder*.kt` | MVU state/actions, runtime permission request, Compose controls |
| `Move25HealthApplication` | Manual composition root and background runner registration |

Dependencies point inward: Android adapters implement ports; application code depends on ports and domain; the functional core has no platform imports.

## Fail-closed decision pipeline

1. Product and user activation must produce `Activation.Active`.
2. The reminder switch must be enabled.
3. An active `health:activity` consent must exist before the timeline is read.
4. Current local time must be outside quiet hours and any explicit snooze window.
5. The previous delivery must be outside the cooldown window.
6. A qualified continuous sedentary bout must exist.
7. The observation must be fresh, meet the threshold, and have no sufficient movement after the bout.
8. Android notification permission must be granted before publication.
9. A successful notification is followed by state persistence and an audit event.

Every failed gate produces a typed `SedentarySuppressionReason`; it never silently falls through to notification publication.

## Evidence semantics and false-positive controls

`SEDENTARY_MINUTES` is accepted only as a continuous-bout observation:

- unit is minutes;
- value is finite and positive;
- interval ends no later than decision time;
- rejected quality is excluded and quality score is at least `0.4`;
- reported sedentary minutes cover between `80%` and `120%` of the interval.

The interval-coverage rule excludes daily cumulative totals and zero-duration point records. Missing, rejected, future-dated, stale, or semantically ambiguous data yields suppression, never a reminder. Post-bout `ACTIVE_MINUTES` records are interval-bounded; the configured break duration suppresses a reminder as recent movement.

## Android behavior

- DataStore persists policy and delivery/snooze state.
- WorkManager owns a unique 15-minute periodic job and a unique immediate job.
- Work has a battery-not-low constraint and can evaluate local evidence offline.
- Disabling the feature cancels both jobs and resets runtime delivery/snooze state.
- The UI exposes enable/disable, 45/60/90-minute thresholds, 22:00-07:00 quiet hours, immediate check, and 30-minute snooze.
- Runtime notification permission is requested only after the user enables the feature while health monitoring is active.

Periodic work is opportunistic, not an exact alarm. The domain policy therefore relies on evidence timestamps and freshness rather than an exact worker start time.

## Verification

Domain tests cover due decisions, midnight-spanning quiet hours, permission gating, movement, cooldown, snooze, quality filtering, and rejection of daily aggregate data. Application tests cover delivery persistence and audit, repeat suppression, consent preflight without timeline access, and disable/cancel behavior. `tools/validate-source.sh` verifies module boundaries and required integration files.
