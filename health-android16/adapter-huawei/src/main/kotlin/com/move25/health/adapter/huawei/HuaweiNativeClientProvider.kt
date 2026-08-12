package com.move25.health.adapter.huawei

/** Explicit process composition hook installed by the approved Huawei SDK module. */
object HuaweiNativeClientProvider {
    @Volatile private var installed: HuaweiNativeClient? = null
    fun install(client: HuaweiNativeClient) { check(installed == null) { "Huawei native client already installed" }; installed = client }
    fun current(): HuaweiNativeClient = installed ?: UnlinkedHuaweiNativeClient()
}
