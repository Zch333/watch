plugins {
    alias(libs.plugins.android.library)
}

android {
    namespace = "com.move25.health.adapter.huawei"
    compileSdk = 36
    defaultConfig {
        minSdk = 28
        buildConfigField("boolean", "HUAWEI_NATIVE_SDK_LINKED", "false")
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":domain"))
    implementation(project(":ports"))
    implementation(libs.androidx.core)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)

    // Deliberately not version-guessed. After Huawei approval, place the
    // official current AARs under local-sdk/ and enable these compileOnly lines.
    // compileOnly(files("../local-sdk/health-service.aar"))
    // compileOnly(files("../local-sdk/wearengine.aar"))
}
