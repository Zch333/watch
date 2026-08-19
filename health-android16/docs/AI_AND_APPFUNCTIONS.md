# AI and Android 16 App Functions

## Routing

- Deterministic engine first: quality, metrics, baselines, red flags and allowed actions.
- Gemini Nano through ADK/ML Kit when supported. Because the current ML Kit ADK adapter explicitly
  drops function-call parts, the verified report is injected into the turn and no local tool is declared.
- Firebase AI Logic through ADK when Firebase exists and App Check release evidence is true. This
  route exposes one generated tool returning only the verified report.
- Optional model-neutral backend supports server-selected Koog/DeepSeek/OpenAI/etc.; credentials
  never enter the APK.
- Any red flag, missing consent, missing activation, unavailable model or invalid model output falls
  back to the deterministic template.

The output validator rejects diagnosis/medication language, invented numeric facts and missing red
flags before anything is rendered.

## App Functions

The single Android 16 function returns daily-to-30-day aggregate medians and sample counts. It is
compiled with `isEnabled=false`; `AppFunctionManager` can enable it only when the health activation
gate, separate App Functions switch and purpose consent are active. Raw samples, identity, mutation,
authorization, device control and delete actions are intentionally not exported to system agents.

ADK, ML Kit GenAI and App Functions are pre-GA/alpha surfaces. Their pinned versions and generated
IDs must be revalidated whenever upgraded.
