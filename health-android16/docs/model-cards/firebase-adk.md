# Firebase ADK cloud explanation model card

- Provider/runtime: Firebase AI Logic Gemini via Google ADK Kotlin; default model name is configurable.
- Purpose: optional explanation when on-device is unavailable or policy selects cloud.
- Data: minimal deterministic report through `get_verified_health_summary`; no model key in APK.
- Controls: Firebase configuration, App Check evidence, health activation, AI consent and user switch.
- Tool: one read-only generated tool; no authorization, mutation, device control, raw data or deletion.
- Validation: all output is untrusted and must pass narrative verification before UI display.
- Known risks: cloud transfer, provider/model drift, outage, abuse and prompt injection.
- Release: App Check enforcement, privacy assessment and per-version safety evaluation required.
