package com.move25.health.application

import com.move25.health.domain.*

data class HealthState(
    val releaseEnabled: Boolean,
    val userEnabled: Boolean = false,
    val aiEnabled: Boolean = false,
    val researchEnabled: Boolean = false,
    val releaseEvidence: ReleaseEvidence = ReleaseEvidence(),
    val capabilities: Map<String, Capability> = emptyMap(),
    val consents: Map<String, ConsentId> = emptyMap(),
    val revision: Long = 0,
) {
    val activation: Activation get() = activationState(releaseEnabled, userEnabled, releaseEvidence)
}

sealed interface HealthCommand {
    data class SetUserSwitch(val enabled: Boolean) : HealthCommand
    data class SetAiSwitch(val enabled: Boolean) : HealthCommand
    data class ObserveCapability(val id: String, val capability: Capability) : HealthCommand
    data class GrantConsent(val purpose: String, val consentId: ConsentId) : HealthCommand
    data class RevokeConsent(val purpose: String) : HealthCommand
    data class Sync(val subjectId: SubjectId, val groupId: String, val interval: TimeInterval) : HealthCommand
    data class Compute(val subjectId: SubjectId, val algorithmIds: Set<String>, val interval: TimeInterval) : HealthCommand
    data class GenerateInsight(val subjectId: SubjectId, val metricIds: Set<MetricId>, val interval: TimeInterval) : HealthCommand
    data class RequestAiExplanation(val subjectId: SubjectId, val insightId: String) : HealthCommand
    data class StartWatchSession(val deviceId: String, val request: SensorSessionRequest) : HealthCommand
    data class DeleteSubjectData(val subjectId: SubjectId) : HealthCommand
    data class ExportSubject(val subjectId: SubjectId, val fhirResearch: Boolean) : HealthCommand
}

sealed interface HealthEvent {
    data class UserSwitchChanged(val enabled: Boolean) : HealthEvent
    data class AiSwitchChanged(val enabled: Boolean) : HealthEvent
    data class CapabilityObserved(val id: String, val capability: Capability) : HealthEvent
    data class ConsentGranted(val purpose: String, val consentId: ConsentId) : HealthEvent
    data class ConsentRevoked(val purpose: String) : HealthEvent
}

sealed interface HealthEffect {
    data class PersistUserSwitch(val enabled: Boolean) : HealthEffect
    data class PersistAiSwitch(val enabled: Boolean) : HealthEffect
    data class ReadPlatformRecords(val subjectId: SubjectId, val group: HuaweiDataGroup, val interval: TimeInterval) : HealthEffect
    data class RunAlgorithms(val subjectId: SubjectId, val algorithmIds: Set<String>, val interval: TimeInterval) : HealthEffect
    data class ComposeInsight(val subjectId: SubjectId, val metricIds: Set<MetricId>, val interval: TimeInterval) : HealthEffect
    data class CallAi(val subjectId: SubjectId, val insightId: String) : HealthEffect
    data class OpenWatchSession(val deviceId: String, val request: SensorSessionRequest) : HealthEffect
    data class DeleteEverywhere(val subjectId: SubjectId) : HealthEffect
    data class Export(val subjectId: SubjectId, val fhirResearch: Boolean) : HealthEffect
}

data class Decision(val next: HealthState, val events: List<HealthEvent>, val effects: List<HealthEffect>)

fun decide(state: HealthState, command: HealthCommand): Result<DomainError, Decision> = when (command) {
    is HealthCommand.SetUserSwitch -> Result.Ok(Decision(state.copy(userEnabled = command.enabled, revision = state.revision + 1), listOf(HealthEvent.UserSwitchChanged(command.enabled)), listOf(HealthEffect.PersistUserSwitch(command.enabled))))
    is HealthCommand.SetAiSwitch -> Result.Ok(Decision(state.copy(aiEnabled = command.enabled, revision = state.revision + 1), listOf(HealthEvent.AiSwitchChanged(command.enabled)), listOf(HealthEffect.PersistAiSwitch(command.enabled))))
    is HealthCommand.ObserveCapability -> Result.Ok(Decision(state.copy(capabilities = state.capabilities + (command.id to command.capability), revision = state.revision + 1), listOf(HealthEvent.CapabilityObserved(command.id, command.capability)), emptyList()))
    is HealthCommand.GrantConsent -> Result.Ok(Decision(state.copy(consents = state.consents + (command.purpose to command.consentId), revision = state.revision + 1), listOf(HealthEvent.ConsentGranted(command.purpose, command.consentId)), emptyList()))
    is HealthCommand.RevokeConsent -> Result.Ok(Decision(state.copy(consents = state.consents - command.purpose, revision = state.revision + 1), listOf(HealthEvent.ConsentRevoked(command.purpose)), emptyList()))
    is HealthCommand.DeleteSubjectData -> Result.Ok(Decision(state, emptyList(), listOf(HealthEffect.DeleteEverywhere(command.subjectId))))
    is HealthCommand.ExportSubject -> if (state.activation !is Activation.Active) Result.Err(DomainError("HEALTH_MONITORING_DORMANT")) else Result.Ok(Decision(state, emptyList(), listOf(HealthEffect.Export(command.subjectId, command.fhirResearch))))
    is HealthCommand.Sync -> {
        if (state.activation !is Activation.Active) Result.Err(DomainError("HEALTH_MONITORING_DORMANT"))
        else huaweiDataPlan.firstOrNull { it.id == command.groupId }?.let { group ->
            if (state.consents["health:${group.id}"] == null) Result.Err(DomainError("CONSENT_REQUIRED", group.id))
            else if (state.capabilities[group.id] !is Capability.Available) Result.Err(DomainError("CAPABILITY_NOT_AVAILABLE", group.id))
            else Result.Ok(Decision(state, emptyList(), listOf(HealthEffect.ReadPlatformRecords(command.subjectId, group, command.interval))))
        } ?: Result.Err(DomainError("UNKNOWN_HUAWEI_DATA_GROUP"))
    }
    is HealthCommand.Compute -> if (state.activation !is Activation.Active) Result.Err(DomainError("HEALTH_MONITORING_DORMANT")) else Result.Ok(Decision(state, emptyList(), listOf(HealthEffect.RunAlgorithms(command.subjectId, command.algorithmIds, command.interval))))
    is HealthCommand.GenerateInsight -> if (state.activation !is Activation.Active) Result.Err(DomainError("HEALTH_MONITORING_DORMANT")) else Result.Ok(Decision(state, emptyList(), listOf(HealthEffect.ComposeInsight(command.subjectId, command.metricIds, command.interval))))
    is HealthCommand.RequestAiExplanation -> when {
        state.activation !is Activation.Active -> Result.Err(DomainError("HEALTH_MONITORING_DORMANT"))
        !state.aiEnabled || state.consents["ai_explanation"] == null -> Result.Err(DomainError("AI_CONSENT_REQUIRED"))
        else -> Result.Ok(Decision(state, emptyList(), listOf(HealthEffect.CallAi(command.subjectId, command.insightId))))
    }
    is HealthCommand.StartWatchSession -> when {
        state.activation !is Activation.Active -> Result.Err(DomainError("HEALTH_MONITORING_DORMANT"))
        state.consents["watch_sensor"] == null -> Result.Err(DomainError("CONSENT_REQUIRED", "watch_sensor"))
        state.capabilities["wear_engine_sensor"] !is Capability.Available -> Result.Err(DomainError("CAPABILITY_NOT_AVAILABLE", "wear_engine_sensor"))
        else -> validateSession(command.request).map { Decision(state, emptyList(), listOf(HealthEffect.OpenWatchSession(command.deviceId, it))) }
    }
}
