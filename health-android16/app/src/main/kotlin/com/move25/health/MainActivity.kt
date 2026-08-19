package com.move25.health

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.move25.health.ui.HealthViewModel
import com.move25.health.ui.Move25AppRoot
import com.move25.health.ui.SedentaryReminderViewModel

class MainActivity : ComponentActivity() {
    private val healthViewModel: HealthViewModel by viewModels {
        HealthViewModel.factory((application as Move25HealthApplication).graph)
    }
    private val sedentaryViewModel: SedentaryReminderViewModel by viewModels {
        SedentaryReminderViewModel.factory((application as Move25HealthApplication).graph)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { Move25AppRoot(healthViewModel, sedentaryViewModel) }
    }
}
