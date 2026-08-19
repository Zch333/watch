#!/usr/bin/env bash
set -euo pipefail

# Keep source validation on GNU tools available by default on GitHub-hosted Ubuntu runners.
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
for item in "${required[@]}"; do
  test -f "$project_dir/$item"
done

grep -q '^MOVE25_HEALTH_RELEASE_ENABLED=false$' "$project_dir/gradle.properties"
grep -q '^MOVE25_HEALTH_RESEARCH_ENABLED=false$' "$project_dir/gradle.properties"
evidence_count="$(grep -Ec 'buildConfigField\("boolean", "EVIDENCE_[A-Z_]+", "false"\)' "$project_dir/app/build.gradle.kts" || true)"
test "$evidence_count" -ge 9
grep -R -Fq -- '@AppFunction(isEnabled = false' "$project_dir/app/src/main/kotlin"
grep -Fq -- 'activation is Activation.Active && userEnabled' "$project_dir/app/src/main/kotlin/com/move25/health/appfunctions/AppFunctionGate.kt"
grep -Fq -- 'APP_FUNCTION_CONSENT_REQUIRED' "$project_dir/app/src/main/kotlin/com/move25/health/appfunctions/AppFunctionBridge.kt"

if grep -R -n -E --binary-files=without-match --include='*.kt' \
  '^import (android|androidx|com\.huawei|okhttp|retrofit|room|firebase|com\.google\.adk)' \
  "$project_dir/domain" "$project_dir/ports"; then
  echo 'forbidden platform dependency in domain/ports' >&2
  exit 1
fi
if grep -R -n -E --binary-files=without-match \
  '@hms\.health\.(store|service)' "$project_dir/lite-companion-contract"; then
  echo 'GT6 API 20 companion imports API 24 health service' >&2
  exit 1
fi
if grep -R -n -E --binary-files=without-match \
  --exclude-dir=.git --exclude-dir=.gradle --exclude-dir=build --exclude-dir=node_modules \
  --include='*.kt' --include='*.js' \
  'setInterval|setTimeout|Thread\.sleep|GlobalScope|startForegroundService' "$project_dir"; then
  echo 'unbounded timer/service pattern found' >&2
  exit 1
fi
if grep -R -n -E --binary-files=without-match \
  --exclude-dir=.git --exclude-dir=.gradle --exclude-dir=build --exclude-dir=node_modules \
  '(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)' \
  "$project_dir"; then
  echo 'credential-like value found' >&2
  exit 1
fi

if grep -n -F -- 'tools = HealthAgentTools' \
  "$project_dir/adapter-ai-android/src/main/kotlin/com/move25/health/adapter/ai/android/AdkNanoHealthAgent.kt"; then
  echo 'ML Kit ADK route must not declare unsupported tools' >&2
  exit 1
fi
grep -Fq -- 'MAX_PAYLOAD_BYTES = 960' "$project_dir/lite-companion-contract/protocol.js"
grep -Fq -- 'MAX_WIRE_BYTES = 1024' "$project_dir/lite-companion-contract/protocol.js"

grep -Fq -- 'fun decideSedentaryReminder' "$project_dir/domain/src/main/kotlin/com/move25/health/domain/SedentaryReminder.kt"
grep -Fq -- 'fun evolveSedentaryReminder' "$project_dir/domain/src/main/kotlin/com/move25/health/domain/SedentaryReminder.kt"
grep -Fq -- 'MINIMUM_CONTINUOUS_BOUT_COVERAGE' "$project_dir/domain/src/main/kotlin/com/move25/health/domain/SedentaryReminder.kt"
grep -Fq -- 'PeriodicWorkRequestBuilder<SedentaryReminderWorker>(15, TimeUnit.MINUTES)' "$project_dir/adapter-android/src/main/kotlin/com/move25/health/adapter/android/SedentaryWorkScheduling.kt"
grep -Fq -- 'health:activity' "$project_dir/application/src/main/kotlin/com/move25/health/application/SedentaryReminderUseCases.kt"
grep -Fq -- 'POST_NOTIFICATIONS' "$project_dir/app/src/main/AndroidManifest.xml"

while IFS= read -r card; do
  test -f "$project_dir/$card" || {
    echo "missing algorithm card: $card" >&2
    exit 1
  }
done < <(
  grep -oE 'docs/algorithm-cards/[a-z0-9_-]+\.md' \
    "$project_dir/ports/src/main/kotlin/com/move25/health/ports/AlgorithmPort.kt" | sort -u || true
)

echo 'health-android16 source fitness checks passed'
