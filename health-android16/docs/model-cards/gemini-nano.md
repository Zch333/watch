# Gemini Nano explanation model card

- Provider/runtime: Google ML Kit GenAI through AICore, orchestrated by Google ADK Kotlin.
- Purpose: concise Chinese explanation of a precomputed deterministic wellness report.
- Data: pseudonymous session ID, user prompt and verified aggregate report only; no raw waveform.
- Capability: device runtime check; first user request may trigger model download.
- Tool limitation: current ADK ML Kit adapter drops function calls, so no tool is declared. The report
  is injected as the sole fact source.
- Validation: post-output medical-language, number and red-flag checks; invalid output is discarded.
- Known risks: hallucination, prompt injection, unsupported language/device, model/runtime drift.
- Release: blocked until model-version safety suite and supported-device evidence pass.
