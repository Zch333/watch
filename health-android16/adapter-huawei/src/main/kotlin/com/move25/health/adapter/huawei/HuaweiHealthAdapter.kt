package com.move25.health.adapter.huawei

import com.move25.health.domain.*
import com.move25.health.ports.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

class HuaweiHealthAdapter(
    private val native: HuaweiNativeClient,
    private val cloud: HuaweiCloudHealthClient?,
    private val nowEpochMs: () -> Long = System::currentTimeMillis,
) : PlatformHealthPort {
    override suspend fun capabilities(): Map<String, Capability> {
        val status = native.sdkStatus()
        if (status !is NativeSdkStatus.Ready) return huaweiDataPlan.associate { it.id to status.capability() }
        val catalog = native.approvedCatalog()
        return huaweiDataPlan.associate { group ->
            val types = catalog.filter { it.groupId == group.id }
            group.id to when {
                types.isEmpty() -> Capability.Unsupported("TYPE_NOT_IN_APPROVED_HUAWEI_CATALOG")
                types.none { it.supportedOnDevice || it.supportedInCloud } -> Capability.Unsupported("TYPE_NOT_AVAILABLE_ON_CONFIGURED_CHANNELS")
                else -> Capability.Available(mapOf(
                    "nativeTypes" to types.joinToString(",") { it.nativeType },
                    "channels" to buildList { if (types.any { it.supportedOnDevice }) add("android"); if (types.any { it.supportedInCloud }) add("cloud") }.joinToString(","),
                ))
            }
        }
    }

    override suspend fun requestAuthorization(scopes: Set<DataScope>): Result<DomainError, AuthorizationResult> = runCatching {
        val catalog = native.approvedCatalog()
        val requested = scopes.flatMap { requested ->
            requested.platformValue?.let(::listOf) ?: catalog.filter { it.groupId == requested.id }.map { it.readScope }
        }.toSet()
        if (requested.isEmpty()) return Result.Err(DomainError("NO_APPROVED_SCOPE_MAPPING"))
        val result = native.authorize(requested)
        Result.Ok(AuthorizationResult(
            scopes.filter { scope -> scope.platformValue?.let { it in result.grantedScopes } ?: catalog.filter { it.groupId == scope.id }.any { it.readScope in result.grantedScopes } }.toSet(),
            scopes.filter { scope -> scope.platformValue?.let { it in result.deniedScopes } ?: catalog.filter { it.groupId == scope.id }.all { it.readScope in result.deniedScopes } }.toSet(),
        ))
    }.getOrElse { Result.Err(DomainError("HUAWEI_AUTHORIZATION_FAILED", it.message)) }

    override fun read(request: ReadRequest): Flow<Result<DomainError, RawPlatformRecord>> = flow {
        val groups = huaweiDataPlan.filter { it.kinds.any(request.kinds::contains) }
        val catalog = native.approvedCatalog().filter { type -> type.groupId in groups.map { it.id } }
        if (catalog.isEmpty()) {
            emit(Result.Err(DomainError("HUAWEI_DATA_TYPE_UNAVAILABLE")))
            return@flow
        }
        val seen = mutableSetOf<String>()
        try {
            native.read(NativeReadRequest(catalog.filter { it.supportedOnDevice }.map { it.nativeType }.toSet(),
                request.interval.start.value, request.interval.endExclusive.value, request.cursor?.opaqueValue))
                .collect { item ->
                    if (seen.add("${item.nativeType}:${item.id}")) emit(Result.Ok(item.raw(request.subjectId, nowEpochMs())))
                }
        } catch (failure: Throwable) {
            emit(Result.Err(DomainError("HUAWEI_ANDROID_READ_FAILED", failure.message)))
        }
        cloud?.read(catalog.filter { it.supportedInCloud }, request)?.collect { result ->
            when (result) {
                is Result.Err -> emit(result)
                is Result.Ok -> if (seen.add("${result.value.kind}:${result.value.platformRecordId}")) emit(result)
            }
        }
    }

    override fun changes(cursor: SyncCursor?): Flow<Result<DomainError, PlatformChange>> = flow {
        if (cloud == null) {
            emit(Result.Err(DomainError("HUAWEI_CLOUD_NOT_CONFIGURED")))
            return@flow
        }
        cloud.changes(cursor).collect { result -> emit(result.map { PlatformChange(it, null) }) }
    }

    override suspend fun revoke(scopes: Set<DataScope>): Result<DomainError, Unit> = runCatching {
        val catalog = native.approvedCatalog()
        val nativeScopes = scopes.flatMap { scope ->
            scope.platformValue?.let(::listOf) ?: catalog.filter { type -> type.groupId == scope.id }.map(NativeDataType::readScope)
        }.toSet()
        native.revoke(nativeScopes)
        cloud?.revoke(nativeScopes)
        Result.Ok(Unit)
    }.getOrElse { Result.Err(DomainError("HUAWEI_REVOKE_FAILED", it.message)) }

    private fun NativeHealthRecord.raw(subjectId: SubjectId, syncedAt: Long) = RawPlatformRecord(
        id, subjectId, canonicalKind.name, canonicalValueJson, canonicalUnit.name,
        startEpochMs, endEpochMs, deviceModel, deviceIdPseudonym, firmwareVersion, apiName,
        apiVersion, syncedAt, cursor,
    )
}

private fun NativeSdkStatus.capability(): Capability = when (this) {
    NativeSdkStatus.Ready -> Capability.Available()
    is NativeSdkStatus.NotInstalled -> Capability.Unsupported("SDK_NOT_LINKED:$component")
    is NativeSdkStatus.ApprovalRequired -> Capability.RequiresApproval(service)
    is NativeSdkStatus.Unsupported -> Capability.Unsupported(reason)
    is NativeSdkStatus.Unavailable -> Capability.TemporarilyUnavailable(reason)
}
