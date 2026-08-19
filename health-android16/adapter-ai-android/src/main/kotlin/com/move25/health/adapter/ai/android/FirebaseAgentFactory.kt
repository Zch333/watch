package com.move25.health.adapter.ai.android

import android.content.Context
import com.google.firebase.FirebaseApp
import com.move25.health.ports.CloudAgentPort

/** Keeps Firebase optional: a source-only checkout is valid without google-services.json. */
object FirebaseAgentFactory {
    fun createIfConfigured(
        context: Context,
        modelName: String = "gemini-flash-latest",
        appCheckEvidence: () -> Boolean,
    ): CloudAgentPort? = if (FirebaseApp.getApps(context.applicationContext).isEmpty()) null
    else FirebaseAdkHealthAgent(context, modelName, appCheckEvidence)
}
