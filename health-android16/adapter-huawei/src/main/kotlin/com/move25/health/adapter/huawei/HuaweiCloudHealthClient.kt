package com.move25.health.adapter.huawei

import com.move25.health.domain.*
import com.move25.health.ports.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * Calls Move25's backend proxy. Huawei client secrets and cloud refresh tokens never enter the APK.
 * The backend performs the official Health Service Kit REST call and returns canonical records.
 */
class HuaweiCloudHealthClient(
    private val config: BackendConfig,
    private val http: OkHttpClient,
    private val tokens: BackendAccessTokenProvider,
) {
    fun read(types: List<NativeDataType>, request: ReadRequest): Flow<Result<DomainError, RawPlatformRecord>> = flow {
        if (types.isEmpty()) return@flow
        val body = JSONObject().put("subjectPseudonym", request.subjectId.value)
            .put("nativeTypes", JSONArray(types.map { it.nativeType }))
            .put("startEpochMs", request.interval.start.value).put("endEpochMs", request.interval.endExclusive.value)
            .put("cursor", request.cursor?.opaqueValue).toString()
        val response = http.executeAwait(Request.Builder().url(config.baseUrl.resolve("v1/huawei/health/records")!!)
            .bearer(tokens.validAccessToken()).post(body.toRequestBody(JSON)).build())
        response.use {
            if (!it.isSuccessful) {
                emit(Result.Err(DomainError("HUAWEI_CLOUD_HTTP_${it.code}")))
                return@flow
            }
            val root = JSONObject(it.body.string())
            val records = root.optJSONArray("records") ?: JSONArray()
            for (index in 0 until records.length()) emit(parseRecord(records.getJSONObject(index), request.subjectId))
        }
    }

    fun changes(cursor: SyncCursor?): Flow<Result<DomainError, RawPlatformRecord>> = flow {
        val subject = cursor?.subjectId ?: run { emit(Result.Err(DomainError("CHANGE_CURSOR_REQUIRED"))); return@flow }
        val url = config.baseUrl.resolve("v1/huawei/health/changes")!!.newBuilder()
            .addQueryParameter("source", cursor.source).addQueryParameter("dataType", cursor.dataType)
            .addQueryParameter("cursor", cursor.opaqueValue).build()
        val response = http.executeAwait(Request.Builder().url(url).bearer(tokens.validAccessToken()).get().build())
        response.use {
            if (!it.isSuccessful) { emit(Result.Err(DomainError("HUAWEI_CHANGES_HTTP_${it.code}"))); return@flow }
            val records = JSONObject(it.body.string()).optJSONArray("records") ?: JSONArray()
            for (index in 0 until records.length()) emit(parseRecord(records.getJSONObject(index), subject))
        }
    }

    suspend fun revoke(scopes: Set<String>) {
        if (scopes.isEmpty()) return
        val body = JSONObject().put("scopes", JSONArray(scopes.toList())).toString().toRequestBody(JSON)
        http.executeAwait(Request.Builder().url(config.baseUrl.resolve("v1/huawei/health/revoke")!!)
            .bearer(tokens.validAccessToken()).post(body).build()).use { require(it.isSuccessful) }
    }

    private fun parseRecord(json: JSONObject, subjectId: SubjectId): Result<DomainError, RawPlatformRecord> = runCatching {
        val allowed = setOf("id", "kind", "value", "unit", "startEpochMs", "endEpochMs", "deviceModel", "devicePseudonym", "firmwareVersion", "apiName", "apiVersion", "syncedAtEpochMs", "nextCursor")
        if (json.keys().asSequence().any { it !in allowed }) error("Unexpected cloud record field")
        RawPlatformRecord(json.getString("id"), subjectId, json.getString("kind"), json.get("value").toString(),
            json.getString("unit"), json.getLong("startEpochMs"), json.getLong("endEpochMs"),
            json.getString("deviceModel"), json.getString("devicePseudonym"), json.optString("firmwareVersion").takeIf(String::isNotBlank),
            json.getString("apiName"), json.getString("apiVersion"), json.getLong("syncedAtEpochMs"),
            json.optString("nextCursor").takeIf(String::isNotBlank))
    }.fold({ Result.Ok(it) }, { Result.Err(DomainError("HUAWEI_CLOUD_RECORD_INVALID", it.message)) })

    private companion object { val JSON = "application/json; charset=utf-8".toMediaType() }
}
