package com.move25.health.domain

sealed interface Result<out E, out A> {
    data class Ok<A>(val value: A) : Result<Nothing, A>
    data class Err<E>(val error: E) : Result<E, Nothing>
}

inline fun <E, A, B> Result<E, A>.map(transform: (A) -> B): Result<E, B> = when (this) {
    is Result.Ok -> Result.Ok(transform(value))
    is Result.Err -> this
}

inline fun <E, A, B> Result<E, A>.flatMap(transform: (A) -> Result<E, B>): Result<E, B> = when (this) {
    is Result.Ok -> transform(value)
    is Result.Err -> this
}

fun <E, A> Result<E, A>.getOrNull(): A? = when (this) {
    is Result.Ok -> value
    is Result.Err -> null
}

@JvmInline value class SubjectId(val value: String)
@JvmInline value class ObservationId(val value: String)
@JvmInline value class MetricId(val value: String)
@JvmInline value class ConsentId(val value: String)
@JvmInline value class InstantMs(val value: Long)

data class TimeInterval private constructor(val start: InstantMs, val endExclusive: InstantMs) {
    companion object {
        fun of(start: Long, endExclusive: Long): Result<String, TimeInterval> =
            if (start > endExclusive) Result.Err("INTERVAL_START_AFTER_END")
            else Result.Ok(TimeInterval(InstantMs(start), InstantMs(endExclusive)))
    }
    val durationMs: Long get() = endExclusive.value - start.value
}

sealed interface Capability {
    data object Unknown : Capability
    data class Available(val metadata: Map<String, String> = emptyMap()) : Capability
    data class RequiresPermission(val scopes: Set<String>) : Capability
    data class RequiresApproval(val service: String) : Capability
    data class Unsupported(val reason: String) : Capability
    data class TemporarilyUnavailable(val reason: String, val retryAfter: InstantMs? = null) : Capability
}

enum class Confidence { LOW, MEDIUM, HIGH }
enum class EvidenceGrade { E0_UNKNOWN, E1_ENGINEERING, E2_DEVICE_VALIDATED, E3_PUBLISHED, E4_CLINICAL, E5_REGULATORY }
enum class ProductLevel { L0_DISPLAY, L1_WELLNESS, L2_ADVANCED, L3_RESEARCH, L4_REGULATED }

data class DomainError(val code: String, val details: String? = null)

const val WELLNESS_DISCLAIMER =
    "本应用用于个人健康管理、运动恢复和生活方式观察，不用于诊断、治疗、监护或替代专业医疗意见。"
