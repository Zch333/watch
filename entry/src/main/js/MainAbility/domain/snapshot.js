import { domainError, ERROR_CODES } from './errors.js';
import { initialDomainState, withDomainState } from './model.js';
import { noPause, noSkip } from './plan.js';
import { err, ok } from './result.js';
import { scheduleSettings } from './settings.js';
import {
    breakActiveState,
    breakDueState,
    breakFinishedState,
    capabilityDegraded,
    capabilityRequiresApproval,
    capabilitySupported,
    capabilityUnknown,
    capabilityUnsupported,
    completedOutcome,
    expiredOutcome,
    noBreakState,
    planBlockedState,
    planDisabledState,
    planEnabledState,
    planEnablingState,
    planPausedState,
    skippedOutcome
} from './state.js';

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Strict decoding: a v1 snapshot must carry known tags and valid nested
 * values. Unknown tags are never silently replaced by defaults; they are a
 * corrupt payload and fail boot with INVALID_SNAPSHOT so the failure is
 * explicit instead of the app silently resetting user state.
 */
function invalidSnapshot(reason, raw) {
    return err(domainError(ERROR_CODES.INVALID_SNAPSHOT, Object.freeze({
        reason: reason,
        raw: raw
    })));
}

function isInstantLike(value) {
    return value !== null && typeof value === 'object' &&
        value.tag === 'Instant' &&
        typeof value.epochMilliseconds === 'number' &&
        isFinite(value.epochMilliseconds);
}

function hasSemanticKey(value) {
    return value !== null && typeof value === 'object' &&
        value.tag === 'SemanticKey' &&
        typeof value.value === 'string' && value.value.length > 0;
}

function restoreLifecycle(raw) {
    if (raw === undefined || raw === null || typeof raw !== 'object') {
        return invalidSnapshot('missing_plan_lifecycle', raw);
    }
    switch (raw.tag) {
        case 'Disabled':
            return ok(planDisabledState());
        case 'Enabling':
            return ok(planEnablingState());
        case 'Enabled':
            return ok(planEnabledState());
        case 'Paused':
            if (!isInstantLike(raw.until)) {
                return invalidSnapshot('invalid_paused_until', raw);
            }
            return ok(planPausedState(raw.until));
        case 'Blocked':
            return ok(planBlockedState(raw.error));
        default:
            return invalidSnapshot('unknown_plan_lifecycle_tag', raw);
    }
}

function restoreOutcome(raw) {
    if (raw === undefined || raw === null || typeof raw !== 'object') {
        return invalidSnapshot('missing_break_outcome', raw);
    }
    switch (raw.tag) {
        case 'Completed':
            return ok(completedOutcome());
        case 'Skipped':
            return ok(skippedOutcome());
        case 'Expired':
            return ok(expiredOutcome());
        default:
            return invalidSnapshot('unknown_break_outcome_tag', raw);
    }
}

function restoreBreakSession(raw) {
    if (raw === undefined || raw === null || typeof raw !== 'object') {
        return invalidSnapshot('missing_break_session', raw);
    }
    switch (raw.tag) {
        case 'NoBreak':
            return ok(noBreakState());
        case 'Due':
            if (!hasSemanticKey(raw.reminderKey) || !isInstantLike(raw.dueAt)) {
                return invalidSnapshot('invalid_break_due_fields', raw);
            }
            return ok(breakDueState(raw.reminderKey, raw.dueAt));
        case 'Active':
            if (!isInstantLike(raw.startedAt) || !isInstantLike(raw.endsAt) ||
                typeof raw.guidanceId !== 'string') {
                return invalidSnapshot('invalid_break_active_fields', raw);
            }
            return ok(breakActiveState(raw.sessionId, raw.startedAt, raw.endsAt, raw.guidanceId));
        case 'Finished':
            if (!isInstantLike(raw.finishedAt)) {
                return invalidSnapshot('invalid_break_finished_fields', raw);
            }
            const outcomeResult = restoreOutcome(raw.outcome);
            if (outcomeResult.tag === 'Err') {
                return outcomeResult;
            }
            return ok(breakFinishedState(raw.sessionId, raw.finishedAt, outcomeResult.value));
        default:
            return invalidSnapshot('unknown_break_session_tag', raw);
    }
}

function restoreCapability(raw) {
    if (raw === undefined || raw === null || typeof raw !== 'object') {
        return ok(capabilityUnknown());
    }
    switch (raw.tag) {
        case 'Unsupported':
            return ok(capabilityUnsupported(raw.reason));
        case 'RequiresApproval':
            return ok(capabilityRequiresApproval(raw.details));
        case 'Supported':
            return ok(capabilitySupported(raw.features || {}));
        case 'Degraded':
            return ok(capabilityDegraded(raw.reason));
        case 'Unknown':
            return ok(capabilityUnknown());
        default:
            return invalidSnapshot('unknown_capability_tag', raw);
    }
}

function restorePause(raw) {
    if (raw === undefined || raw === null) {
        return ok(noPause());
    }
    if (typeof raw !== 'object') {
        return invalidSnapshot('invalid_pause', raw);
    }
    if (raw.tag === 'NoPause') {
        return ok(noPause());
    }
    if (raw.tag === 'PauseThroughLocal') {
        if (!raw.localDate || typeof raw.localDate !== 'object' ||
            typeof raw.minuteOfDay !== 'object' ||
            typeof raw.minuteOfDay.value !== 'number') {
            return invalidSnapshot('invalid_pause_through_local', raw);
        }
        return ok(Object.freeze({
            tag: 'PauseThroughLocal',
            localDate: raw.localDate,
            minuteOfDay: raw.minuteOfDay
        }));
    }
    return invalidSnapshot('unknown_pause_tag', raw);
}

function restoreSkip(raw) {
    if (raw === undefined || raw === null) {
        return ok(noSkip());
    }
    if (typeof raw !== 'object') {
        return invalidSnapshot('invalid_skip', raw);
    }
    if (raw.tag === 'NoSkip') {
        return ok(noSkip());
    }
    if (raw.tag === 'SkipReminder') {
        if (!hasSemanticKey(raw.reminderKey)) {
            return invalidSnapshot('invalid_skip_reminder_key', raw);
        }
        return ok(Object.freeze({
            tag: 'SkipReminder',
            reminderKey: raw.reminderKey
        }));
    }
    return invalidSnapshot('unknown_skip_tag', raw);
}

/**
 * Create a versioned snapshot from domain state.
 */
export function createSnapshot(state) {
    return Object.freeze({
        tag: 'Snapshot',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        revision: state.revision || 0,
        settings: state.settings,
        planLifecycle: state.planLifecycle,
        pause: state.pause,
        skip: state.skip,
        breakSession: state.breakSession,
        capability: state.capability,
        guidanceIndex: state.guidanceIndex || 0
    });
}

/**
 * migrate : RawSnapshot -> Result<MigrationError, Snapshot>
 * Pure, stepwise. Currently only v1.
 */
export function migrateSnapshot(raw) {
    if (raw === null || raw === undefined) {
        return ok(createSnapshot(initialDomainState()));
    }
    if (typeof raw !== 'object') {
        return err(domainError(ERROR_CODES.INVALID_SNAPSHOT, raw));
    }

    let version = raw.schemaVersion;
    if (version === undefined || version === null) {
        // Pre-versioned probe payload: treat as empty defaults with diagnostic flag
        return err(domainError(ERROR_CODES.INVALID_SNAPSHOT, Object.freeze({
            reason: 'missing_schema_version',
            raw: raw
        })));
    }
    if (typeof version !== 'number' || version < 1) {
        return err(domainError(ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION, version));
    }
    if (version > CURRENT_SCHEMA_VERSION) {
        return err(domainError(ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION, version));
    }

    // Future: while (version < CURRENT) { raw = migrateStep(raw, version); version += 1; }
    if (version === 1) {
        let settings;
        if (raw.settings && raw.settings.tag === 'ScheduleSettings') {
            settings = raw.settings;
        } else if (raw.settings && typeof raw.settings === 'object') {
            const parsed = scheduleSettings(raw.settings);
            if (parsed.tag === 'Err') {
                return parsed;
            }
            settings = parsed.value;
        } else {
            return err(domainError(ERROR_CODES.INVALID_SNAPSHOT, Object.freeze({
                reason: 'missing_settings'
            })));
        }

        const lifecycleResult = restoreLifecycle(raw.planLifecycle);
        if (lifecycleResult.tag === 'Err') {
            return lifecycleResult;
        }
        const pauseResult = restorePause(raw.pause);
        if (pauseResult.tag === 'Err') {
            return pauseResult;
        }
        const skipResult = restoreSkip(raw.skip);
        if (skipResult.tag === 'Err') {
            return skipResult;
        }
        const sessionResult = restoreBreakSession(raw.breakSession);
        if (sessionResult.tag === 'Err') {
            return sessionResult;
        }
        const capabilityResult = restoreCapability(raw.capability || raw.capabilityObservation);
        if (capabilityResult.tag === 'Err') {
            return capabilityResult;
        }

        const snapshot = Object.freeze({
            tag: 'Snapshot',
            schemaVersion: 1,
            revision: typeof raw.revision === 'number' ? raw.revision : 0,
            settings: settings,
            planLifecycle: lifecycleResult.value,
            pause: pauseResult.value,
            skip: skipResult.value,
            breakSession: sessionResult.value,
            capability: capabilityResult.value,
            guidanceIndex: typeof raw.guidanceIndex === 'number' ? raw.guidanceIndex : 0
        });
        return ok(snapshot);
    }

    return err(domainError(ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION, version));
}

/**
 * Rehydrate domain state from a validated snapshot.
 */
export function stateFromSnapshot(snapshot) {
    const base = initialDomainState();
    return withDomainState(base, {
        settings: snapshot.settings || base.settings,
        planLifecycle: snapshot.planLifecycle || base.planLifecycle,
        pause: snapshot.pause || base.pause,
        skip: snapshot.skip || base.skip,
        breakSession: snapshot.breakSession || base.breakSession,
        capability: snapshot.capability || base.capability,
        guidanceIndex: snapshot.guidanceIndex || 0,
        revision: snapshot.revision || 0
    });
}

/**
 * Load path: raw -> migrate -> state
 */
export function rehydrateFromRaw(raw) {
    const migrated = migrateSnapshot(raw);
    if (migrated.tag === 'Err') {
        return migrated;
    }
    return ok(stateFromSnapshot(migrated.value));
}

/**
 * Explicit reset: fresh defaults with schemaVersion. Use when the stored
 * snapshot is corrupt and the user chose to reset.
 */
export function freshSnapshot() {
    return createSnapshot(initialDomainState());
}
