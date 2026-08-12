plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.move25.health.adapter.ai.android"
    compileSdk { version = release(36) { minorApiLevel = 1 } }
    defaultConfig { minSdk = 28 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":domain"))
    implementation(project(":ports"))
    implementation(libs.google.adk.core)
    implementation(libs.google.adk.mlkit)
    implementation(libs.google.adk.firebase)
    implementation(libs.google.mlkit.genai.prompt)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.ai)
    implementation(libs.firebase.appcheck)
    implementation(libs.kotlinx.coroutines.android)
    ksp(libs.google.adk.processor)
}
