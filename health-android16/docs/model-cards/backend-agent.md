# Model-neutral backend agent card

- Provider/runtime: selected server-side (for example Koog/DeepSeek/OpenAI); APK is provider-neutral.
- Purpose: authenticated streaming explanation of a deterministic wellness summary.
- Data: pseudonymous subject/session, locale, user prompt and minimal verified report.
- Transport: HTTPS, optional certificate pins and short-lived bearer token supplied by an injected port.
- Controls: no hardcoded key; cloud adapter is absent from the default composition root.
- Validation: server structured controls plus mandatory client narrative validation/fallback.
- Known risks: backend compromise, logging leakage, provider drift, partial SSE and deletion mismatch.
- Release: threat model, retention/deletion verification, pin rotation and provider model card required.
