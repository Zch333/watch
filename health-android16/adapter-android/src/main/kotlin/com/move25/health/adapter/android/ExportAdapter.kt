package com.move25.health.adapter.android

import com.move25.health.domain.*
import com.move25.health.ports.*
import org.json.JSONArray
import org.json.JSONObject

class LocalExportAdapter(
    private val timeline: TimelineStorePort,
    private val metrics: MetricStorePort,
) : ExportPort {
    override suspend fun exportJson(subjectId: SubjectId): Result<DomainError, ExportArtifact> {
        val observations = when (val result = timeline.query(TimelineQuery(subjectId, null))) {
            is Result.Ok -> result.value
            is Result.Err -> return result
        }
        val derived = when (val result = metrics.query(subjectId, emptySet(), null)) {
            is Result.Ok -> result.value
            is Result.Err -> return result
        }
        val root = JSONObject().put("schemaVersion", 1).put("subjectPseudonym", subjectId.value)
            .put("disclaimer", WELLNESS_DISCLAIMER)
            .put("observations", JSONArray(observations.map { observationJson(it) }))
            .put("derivedMetrics", JSONArray(derived.map { metricJson(it) }))
        return Result.Ok(ExportArtifact("move25-health-${subjectId.value}.json", "application/json", root.toString(2).toByteArray()))
    }

    override suspend fun exportFhirResearch(subjectId: SubjectId, researchConsent: ConsentId): Result<DomainError, ExportArtifact> {
        if (researchConsent.value.isBlank()) return Result.Err(DomainError("RESEARCH_CONSENT_REQUIRED"))
        val observations = when (val result = timeline.query(TimelineQuery(subjectId, null))) {
            is Result.Ok -> result.value
            is Result.Err -> return result
        }
        val bundle = JSONObject().put("resourceType", "Bundle").put("type", "collection")
            .put("meta", JSONObject().put("tag", JSONArray().put(JSONObject().put("system", "https://move25.app/research-consent").put("code", researchConsent.value))))
            .put("entry", JSONArray(observations.map { item -> JSONObject().put("resource", JSONObject()
                .put("resourceType", "Observation").put("id", item.id.value).put("status", "final")
                .put("subject", JSONObject().put("reference", "Patient/${subjectId.value}"))
                .put("effectivePeriod", JSONObject().put("startEpochMs", item.interval.start.value).put("endEpochMs", item.interval.endExclusive.value))
                .put("code", JSONObject().put("text", item.kind.name)).put("valueString", item.value.toString())) }))
        return Result.Ok(ExportArtifact("move25-research-${subjectId.value}-fhir.json", "application/fhir+json", bundle.toString(2).toByteArray()))
    }

    private fun observationJson(item: Observation) = JSONObject().put("id", item.id.value).put("kind", item.kind.name)
        .put("unit", item.unit.name).put("value", item.value.toString()).put("startEpochMs", item.interval.start.value)
        .put("endEpochMs", item.interval.endExclusive.value).put("sourcePlatform", item.provenance.sourcePlatform)
        .put("sourceDevice", item.provenance.sourceDeviceIdPseudonym).put("platformRecordId", item.provenance.platformRecordId)
        .put("qualityScore", item.quality.score).put("consentId", item.consentId.value)

    private fun metricJson(item: DerivedMetric) = JSONObject().put("id", item.id).put("metricId", item.metricId.value)
        .put("value", item.value).put("unit", item.unit.name).put("algorithm", item.algorithm.id)
        .put("algorithmVersion", item.algorithm.version).put("inputHash", item.provenance.inputHash)
        .put("qualityScore", item.quality.score).put("evidence", item.evidence.name)
}
