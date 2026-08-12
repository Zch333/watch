plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

val releaseEnabled = providers.gradleProperty("MOVE25_HEALTH_RELEASE_ENABLED").orElse("false")
val researchEnabled = providers.gradleProperty("MOVE25_HEALTH_RESEARCH_ENABLED").orElse("false")

android {
    namespace = "com.move25.health"
    compileSdk { version = release(36) { minorApiLevel = 1 } }

    defaultConfig {
        applicationId = "com.move25.health"
        minSdk = 28
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0-dormant"
        buildConfigField("boolean", "HEALTH_RELEASE_ENABLED", releaseEnabled.get())
        buildConfigField("boolean", "RESEARCH_RELEASE_ENABLED", researchEnabled.get())
        buildConfigField("boolean", "EVIDENCE_DEVICE_CAPABILITY", "false")
        buildConfigField("boolean", "EVIDENCE_SCOPES_APPROVED", "false")
        buildConfigField("boolean", "EVIDENCE_DATA_QUALITY", "false")
        buildConfigField("boolean", "EVIDENCE_ALGORITHM_CARDS", "false")
        buildConfigField("boolean", "EVIDENCE_PRIVACY_IMPACT", "false")
        buildConfigField("boolean", "EVIDENCE_AI_SAFETY", "false")
        buildConfigField("boolean", "EVIDENCE_FIREBASE_APP_CHECK", "false")
        buildConfigField("boolean", "EVIDENCE_DELETION_EXPORT", "false")
        buildConfigField("boolean", "EVIDENCE_POWER_BUDGET", "false")
        buildConfigField("String", "API_BASE_URL", "\"https://invalid.move25.local/\"")
        buildConfigField("String", "HUAWEI_PEER_PACKAGE", "\"\"")
        buildConfigField("String", "HUAWEI_PEER_CERT_SHA256", "\"\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug { applicationIdSuffix = ".debug" }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging.resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
}

if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

dependencies {
    implementation(project(":domain"))
    implementation(project(":ports"))
    implementation(project(":application"))
    implementation(project(":adapter-android"))
    implementation(project(":adapter-huawei"))
    implementation(project(":adapter-ai-android"))
    implementation(libs.androidx.core)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.kotlinx.coroutines.android)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.androidx.appfunctions)
    ksp(libs.androidx.appfunctions.compiler)
}

ksp { arg("appfunctions:aggregateAppFunctions", "true") }
