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

function restoreLifecycle(raw) {
    if (!raw || typeof raw !== 'object') {
        return planDisabledState();
    }
    switch (raw.tag) {
        case 'Disabled':
            return planDisabledState();
        case 'Enabling':
            return planEnablingState();
        case 'Enabled':
            return planEnabledState();
        case 'Paused':
            return planPausedState(raw.until);
        case 'Blocked':
            return planBlockedState(raw.error);
        default:
            return planDisabledState();
    }
}

function restoreOutcome(raw) {
    if (!raw || typeof raw !== 'object') {
        return completedOutcome();
    }
    if (raw.tag === 'Skipped') {
        return skippedOutcome();
    }
    if (raw.tag === 'Expired') {
        return expiredOutcome();
    }
    return completedOutcome();
}

function restoreBreakSession(raw) {
    if (!raw || typeof raw !== 'object') {
        return noBreakState();
    }
    switch (raw.tag) {
        case 'NoBreak':
            return noBreakState();
        case 'Due':
            return breakDueState(raw.reminderKey, raw.dueAt);
        case 'Active':
            return breakActiveState(raw.sessionId, raw.startedAt, raw.endsAt, raw.guidanceId);
        case 'Finished':
            return breakFinishedState(raw.sessionId, raw.finishedAt, restoreOutcome(raw.outcome));
        default:
            return noBreakState();
    }
}

function restoreCapability(raw) {
    if (!raw || typeof raw !== 'object') {
        return capabilityUnknown();
    }
    switch (raw.tag) {
        case 'Unsupported':
            return capabilityUnsupported(raw.reason);
        case 'RequiresApproval':
            return capabilityRequiresApproval(raw.details);
        case 'Supported':
            return capabilitySupported(raw.features || {});
        case 'Degraded':
            return capabilityDegraded(raw.reason);
        case 'Unknown':
        default:
            return capabilityUnknown();
    }
}

function restorePause(raw) {
    if (!raw || raw.tag === 'NoPause') {
        return noPause();
    }
    if (raw.tag === 'PauseThroughLocal') {
        return Object.freeze({
            tag: 'PauseThroughLocal',
            localDate: raw.localDate,
            minuteOfDay: raw.minuteOfDay
        });
    }
    return noPause();
}

function restoreSkip(raw) {
    if (!raw || raw.tag === 'NoSkip') {
        return noSkip();
    }
    if (raw.tag === 'SkipReminder') {
        return Object.freeze({
            tag: 'SkipReminder',
            reminderKey: raw.reminderKey
        });
    }
    return noSkip();
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

        const snapshot = Object.freeze({
            tag: 'Snapshot',
            schemaVersion: 1,
            revision: typeof raw.revision === 'number' ? raw.revision : 0,
            settings: settings,
            planLifecycle: restoreLifecycle(raw.planLifecycle),
            pause: restorePause(raw.pause),
            skip: restoreSkip(raw.skip),
            breakSession: restoreBreakSession(raw.breakSession),
            capability: restoreCapability(raw.capability || raw.capabilityObservation),
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
