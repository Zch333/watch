package com.move25.health.adapter.android

import com.move25.health.domain.*
import org.json.JSONArray
import org.json.JSONObject

internal object DomainJson {
    fun observationValue(value: ObservationValue): String = when (value) {
        is ObservationValue.Scalar -> JSONObject().put("type", "scalar").put("number", value.number)
        is ObservationValue.Series -> JSONObject().put("type", "series").put("values", JSONArray(value.values)).put("sampleRateHz", value.sampleRateHz)
        is ObservationValue.Category -> JSONObject().put("type", "category").put("value", value.value)
        is ObservationValue.BloodPressure -> JSONObject().put("type", "bloodPressure").put("systolic", value.systolic).put("diastolic", value.diastolic)
        is ObservationValue.Route -> JSONObject().put("type", "route").put("points", JSONArray(value.points.map {
            JSONObject().put("epochMs", it.epochMs).put("latitude", it.latitude).put("longitude", it.longitude).put("altitudeM", it.altitudeM)
        }))
    }.toString()

    fun observationValue(raw: String): ObservationValue {
        val json = JSONObject(raw)
        return when (json.getString("type")) {
            "scalar" -> ObservationValue.Scalar(json.getDouble("number"))
            "series" -> ObservationValue.Series(json.getJSONArray("values").doubles(), json.nullableDouble("sampleRateHz"))
            "category" -> ObservationValue.Category(json.getString("value"))
            "bloodPressure" -> ObservationValue.BloodPressure(json.getDouble("systolic"), json.getDouble("diastolic"))
            "route" -> ObservationValue.Route(json.getJSONArray("points").objects().map {
                RoutePoint(it.getLong("epochMs"), it.getDouble("latitude"), it.getDouble("longitude"), it.nullableDouble("altitudeM"))
            })
            else -> error("Unknown observation value")
        }
    }

    fun provenance(value: Provenance): String = JSONObject()
        .put("sourcePlatform", value.sourcePlatform).put("sourceApp", value.sourceApp)
        .put("sourceDeviceModel", value.sourceDeviceModel).put("sourceDeviceIdPseudonym", value.sourceDeviceIdPseudonym)
        .put("firmwareVersion", value.firmwareVersion).put("apiName", value.apiName).put("apiVersion", value.apiVersion)
        .put("originalDataType", value.originalDataType).put("samplingRateHz", value.samplingRateHz)
        .put("sensorLocation", value.sensorLocation).put("algorithmVendor", value.algorithmVendor)
        .put("algorithmVersion", value.algorithmVersion).put("platformRecordId", value.platformRecordId)
        .put("processingChain", JSONArray(value.processingChain)).toString()

    fun provenance(raw: String): Provenance = JSONObject(raw).let {
        Provenance(it.getString("sourcePlatform"), it.getString("sourceApp"), it.getString("sourceDeviceModel"),
            it.getString("sourceDeviceIdPseudonym"), it.nullableString("firmwareVersion"), it.getString("apiName"),
            it.getString("apiVersion"), it.getString("originalDataType"), it.nullableDouble("samplingRateHz"),
            it.nullableString("sensorLocation"), it.nullableString("algorithmVendor"), it.nullableString("algorithmVersion"),
            it.getString("platformRecordId"), it.getJSONArray("processingChain").strings())
    }

    fun quality(value: DataQuality): String {
        val root = JSONObject().put("score", value.score).put("state", when (value) {
            is DataQuality.Good -> "good"; is DataQuality.Degraded -> "degraded"; is DataQuality.Rejected -> "rejected"
        })
        val issues = when (value) {
            is DataQuality.Good -> emptyList(); is DataQuality.Degraded -> value.issues; is DataQuality.Rejected -> value.issues
        }
        return root.put("issues", JSONArray(issues.map { JSONObject().put("dimension", it.dimension.name).put("code", it.code).put("detail", it.description) })).toString()
    }

    fun quality(raw: String): DataQuality {
        val json = JSONObject(raw)
        val issues = json.getJSONArray("issues").objects().map { QualityIssue(QualityDimension.valueOf(it.getString("dimension")), it.getString("code"), it.getString("detail")) }
        return when (json.getString("state")) {
            "good" -> DataQuality.Good(json.getDouble("score"), emptyMap())
            "degraded" -> DataQuality.Degraded(json.getDouble("score"), emptyMap(), issues)
            else -> DataQuality.Rejected(issues)
        }
    }

    fun metricDetail(value: DerivedMetric): String = JSONObject()
        .put("algorithmId", value.algorithm.id).put("algorithmVersion", value.algorithm.version)
        .put("parameterHash", value.algorithm.parameterHash).put("codeRevision", value.algorithm.codeRevision)
        .put("inputIds", JSONArray(value.inputIds.map { it.value })).put("quality", JSONObject(quality(value.quality)))
        .put("uncertainty", value.uncertainty).put("evidence", value.evidence.name)
        .put("inputHash", value.provenance.inputHash).put("qualityPolicyVersion", value.provenance.qualityPolicyVersion)
        .put("executionEnvironment", value.provenance.executionEnvironment).toString()

    fun metric(entity: MetricEntity, detail: String): DerivedMetric {
        val json = JSONObject(detail)
        return DerivedMetric(entity.id, SubjectId(entity.subjectId), MetricId(entity.metricId), entity.value, UnitCode.valueOf(entity.unit),
            TimeInterval.of(entity.startEpochMs, entity.endEpochMs).getOrNull() ?: error("Stored interval invalid"),
            AlgorithmReference(json.getString("algorithmId"), json.getString("algorithmVersion"), json.getString("parameterHash"), json.getString("codeRevision")),
            json.getJSONArray("inputIds").strings().map(::ObservationId), quality(json.getJSONObject("quality").toString()),
            json.nullableDouble("uncertainty"), EvidenceGrade.valueOf(json.getString("evidence")),
            MetricProvenance(json.getString("inputHash"), json.getString("qualityPolicyVersion"), json.getString("executionEnvironment")))
    }

    private fun JSONArray.strings() = (0 until length()).map(::getString)
    private fun JSONArray.doubles() = (0 until length()).map(::getDouble)
    private fun JSONArray.objects() = (0 until length()).map(::getJSONObject)
    private fun JSONObject.nullableString(key: String) = if (isNull(key)) null else getString(key)
    private fun JSONObject.nullableDouble(key: String) = if (isNull(key)) null else getDouble(key)
}
