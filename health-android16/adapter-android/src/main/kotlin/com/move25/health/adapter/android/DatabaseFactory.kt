package com.move25.health.adapter.android

import android.content.Context
import androidx.room.Room

object HealthDatabaseFactory {
    fun create(context: Context): HealthDatabase = Room.databaseBuilder(
        context.applicationContext,
        HealthDatabase::class.java,
        "move25-health.db",
    ).fallbackToDestructiveMigrationOnDowngrade(false).build()
}
