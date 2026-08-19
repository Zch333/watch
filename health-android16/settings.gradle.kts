pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Required only after Huawei approves Health Service/Wear Engine access.
        maven("https://developer.huawei.com/repo/")
    }
}

rootProject.name = "Move25HealthAndroid16"
include(":domain", ":ports", ":application", ":adapter-android", ":adapter-huawei", ":adapter-ai-android", ":contract-tests", ":app")
