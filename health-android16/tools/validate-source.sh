#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"

required=(
  "domain/src/main/kotlin/com/move25/health/domain/Activation.kt"
  "domain/src/main/kotlin/com/move25/health/domain/SedentaryReminder.kt"
  "domain/src/test/kotlin/com/move25/health/domain/SedentaryReminderTest.kt"
  "ports/src/main/kotlin/com/move25/health/ports/Ports.kt"
  "ports/src/main/kotlin/com/move25/health/ports/SedentaryReminderPorts.kt"
  "application/src/main/kotlin/com/move25/health/application/PostSyncAnalysis.kt"
  "application/src/main/kotlin/com/move25/health/application/SedentaryReminderUseCases.kt"
  "application/src/test/kotlin/com/move25/health/application/SedentaryReminderUseCasesTest.kt"
  "adapter-android/src/main/kotlin/com/move25/health/adapter/android/SedentaryPreferences.kt"
  "adapter-android/src/main/kotlin/com/move25/health/adapter/android/SedentaryWorkScheduling.kt"
  "adapter-huawei/src/main/kotlin/com/move25/health/adapter/huawei/HuaweiNativeClient.kt"
  "adapter-ai-android/src/main/kotlin/com/move25/health/adapter/ai/android/AdkNanoHealthAgent.kt"
  "app/src/main/kotlin/com/move25/health/ui/Move25AppRoot.kt"
  "app/src/main/kotlin/com/move25/health/appfunctions/HealthAppFunctionService.kt"
  "docs/SEDENTARY_REMINDERS.md"
  "lite-companion-contract/protocol.js"
)
for item in "${required[@]}"; do test -f "$project_dir/$item"; done

rg -q '^MOVE25_HEALTH_RELEASE_ENABLED=false$' "$project_dir/gradle.properties"
rg -q '^MOVE25_HEALTH_RESEARCH_ENABLED=false$' "$project_dir/gradle.properties"
test "$(rg -c 'buildConfigField\("boolean", "EVIDENCE_[A-Z_]+", "false"\)' "$project_dir/app/build.gradle.kts")" -ge 9
rg -q '@AppFunction\(isEnabled = false' "$project_dir/app/src/main/kotlin"
rg -q 'activation is Activation.Active && userEnabled' "$project_dir/app/src/main/kotlin/com/move25/health/appfunctions/AppFunctionGate.kt"
rg -q 'APP_FUNCTION_CONSENT_REQUIRED' "$project_dir/app/src/main/kotlin/com/move25/health/appfunctions/AppFunctionBridge.kt"

if rg -n '^import (android|androidx|com\.huawei|okhttp|retrofit|room|firebase|com\.google\.adk)' "$project_dir/domain" "$project_dir/ports" -g '*.kt'; then
  echo 'forbidden platform dependency in domain/ports' >&2
  exit 1
fi
if rg -n '@hms\.health\.(store|service)' "$project_dir/lite-companion-contract"; then
  echo 'GT6 API 20 companion imports API 24 health service' >&2
  exit 1
fi
if rg -n 'setInterval|setTimeout|Thread\.sleep|GlobalScope|startForegroundService' "$project_dir" -g '*.{kt,js}'; then
  echo 'unbounded timer/service pattern found' >&2
  exit 1
fi
if rg -n '(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)' "$project_dir"; then
  echo 'credential-like value found' >&2
  exit 1
fi

if rg -n 'tools = HealthAgentTools' "$project_dir/adapter-ai-android/src/main/kotlin/com/move25/health/adapter/ai/android/AdkNanoHealthAgent.kt"; then
  echo 'ML Kit ADK route must not declare unsupported tools' >&2
  exit 1
fi
rg -q 'MAX_PAYLOAD_BYTES = 960' "$project_dir/lite-companion-contract/protocol.js"
rg -q 'MAX_WIRE_BYTES = 1024' "$project_dir/lite-companion-contract/protocol.js"

rg -q 'fun decideSedentaryReminder' "$project_dir/domain/src/main/kotlin/com/move25/health/domain/SedentaryReminder.kt"
rg -q 'fun evolveSedentaryReminder' "$project_dir/domain/src/main/kotlin/com/move25/health/domain/SedentaryReminder.kt"
rg -q 'MINIMUM_CONTINUOUS_BOUT_COVERAGE' "$project_dir/domain/src/main/kotlin/com/move25/health/domain/SedentaryReminder.kt"
rg -q 'PeriodicWorkRequestBuilder<SedentaryReminderWorker>(15, TimeUnit.MINUTES)' "$project_dir/adapter-android/src/main/kotlin/com/move25/health/adapter/android/SedentaryWorkScheduling.kt"
rg -q 'health:activity' "$project_dir/application/src/main/kotlin/com/move25/health/application/SedentaryReminderUseCases.kt"
rg -q 'POST_NOTIFICATIONS' "$project_dir/app/src/main/AndroidManifest.xml"

while IFS= read -r card; do
  test -f "$project_dir/$card" || { echo "missing algorithm card: $card" >&2; exit 1; }
done < <(rg -o 'docs/algorithm-cards/[a-z0-9_-]+\.md' "$project_dir/ports/src/main/kotlin/com/move25/health/ports/AlgorithmPort.kt" | sort -u)

echo 'health-android16 source fitness checks passed'
