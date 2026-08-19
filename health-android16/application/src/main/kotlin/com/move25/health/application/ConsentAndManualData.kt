package com.move25.health.application

import com.move25.health.domain.*
import com.move25.health.ports.*

class AuthorizeDataGroupUseCase(
    private val platform: PlatformHealthPort,
    private val consents: ConsentStorePort,
    private val clock: ClockPort,
) {
    suspend operator fun invoke(subjectId: SubjectId, groupId: String): Result<DomainError, ConsentId> {
        val group = huaweiDataPlan.firstOrNull { it.id == groupId } ?: return Result.Err(DomainError("UNKNOWN_HUAWEI_DATA_GROUP"))
        val scope = DataScope(group.id, group.scope)
        return when (val authorization = platform.requestAuthorization(setOf(scope))) {
            is Result.Err -> authorization
            is Result.Ok -> if (scope !in authorization.value.granted) Result.Err(DomainError("HUAWEI_SCOPE_DENIED", groupId))
            else consents.grant(subjectId, "health:$groupId", setOf(scope), clock.now())
        }
    }
}

class RevokeDataGroupUseCase(
    private val platform: PlatformHealthPort,
    private val consents: ConsentStorePort,
    private val clock: ClockPort,
) {
    suspend operator fun invoke(subjectId: SubjectId, groupId: String): Result<DomainError, Unit> {
        val group = huaweiDataPlan.firstOrNull { it.id == groupId } ?: return Result.Err(DomainError("UNKNOWN_HUAWEI_DATA_GROUP"))
        val local = consents.revoke(subjectId, "health:$groupId", clock.now())
        val remote = platform.revoke(setOf(DataScope(group.id, group.scope)))
        return if (local is Result.Err) local else remote
    }
}

data class ManualObservationInput(
    val kind: ObservationKind,
    val value: ObservationValue,
    val unit: UnitCode,
    val at: InstantMs,
)

class RecordManualObservationUseCase(
    private val timeline: TimelineStorePort,
    private val consents: ConsentStorePort,
    private val clock: ClockPort,
    private val ids: IdPort,
) {
    private val allowed = setOf(ObservationKind.MOOD, ObservationKind.MENSTRUAL_CYCLE,
        ObservationKind.EXTERNAL_BLOOD_PRESSURE, ObservationKind.EXTERNAL_BLOOD_GLUCOSE)

    suspend operator fun invoke(
        subjectId: SubjectId,
        input: ManualObservationInput,
        activation: Activation,
    ): Result<DomainError, Observation> {
        if (activation is Activation.Dormant) return Result.Err(DomainError("HEALTH_FEATURE_DORMANT", activation.reason))
        if (input.kind !in allowed) return Result.Err(DomainError("MANUAL_KIND_NOT_ALLOWED"))
        val consent = consents.activeConsent(subjectId, "manual_health_entry")
            ?: return Result.Err(DomainError("MANUAL_ENTRY_CONSENT_REQUIRED"))
        val observation = Observation(
            ObservationId(ids.next("manual")), subjectId, input.kind, input.value, input.unit,
            TimeInterval.of(input.at.value, input.at.value).getOrNull() ?: return Result.Err(DomainError("MANUAL_INTERVAL_INVALID")),
            Provenance("manual", "Move25 Health Android", "user-entry", "self", null,
                "ManualObservationForm", "1", input.kind.name, null, null, null, null,
                ids.next("record"), listOf("user-entry", "validation/1")),
            DataQuality.Good(1.0, mapOf(QualityDimension.SEMANTIC_VALIDITY to 1.0)), consent, clock.now(),
        )
        return validateObservation(observation).flatMap { valid ->
            timeline.append(listOf(valid)).flatMap { stored ->
                if (stored.inserted == 1) Result.Ok(valid) else Result.Err(DomainError("MANUAL_ENTRY_DUPLICATE"))
            }
        }
    }
}
