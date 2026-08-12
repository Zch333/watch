-keepattributes Signature,*Annotation*
-dontwarn org.conscrypt.**
# Do not keep secret values: no provider secret may exist in the APK.
# Huawei keep rules must be copied from the exact approved SDK package.
-keep class com.move25.health.appfunctions.** { *; }
-keep class com.move25.health.adapter.ai.android.** { *; }
-dontwarn com.google.adk.**
