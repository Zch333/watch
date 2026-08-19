# HRV RMSSD 1.0.0

- Intended use: non-diagnostic recovery trend from qualified RRI.
- Inputs: at least 30 validated 250–2200 ms RRI values; exact interval semantics required.
- Method/output: square root of mean squared successive differences, milliseconds.
- Quality gate: rejects missing, poor or semantically uncertain interval series.
- Evidence: E2 target after device validation; code is implemented but release capability remains gated.
- Failure modes: ectopy/artefact, PPG interval substituted for ECG RRI, posture/breathing/time-of-day differences.
- License: formula/public domain; implementation written for this project.
- Prohibited claims: autonomic/cardiac diagnosis, treatment guidance or ECG equivalence for PRV.
