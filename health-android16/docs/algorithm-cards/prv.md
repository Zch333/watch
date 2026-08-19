# PRV RMSSD research 1.0.0

- Intended use: research-only PPG pulse-rate-variability comparison.
- Inputs: at least 30 validated PPG intervals in milliseconds with signal-quality evidence.
- Method/output: RMSSD labelled `prv_rmssd`, never unqualified HRV.
- Quality gate: requires research mode, separate consent, approved waveform/interval access and validation.
- Evidence: E1 engineering only; not a released consumer feature.
- Failure modes: motion, pulse transit variation, low perfusion, sampling/peak errors and HRV/PRV divergence.
- License: formula/public domain; implementation written for this project.
- Prohibited claims: ECG HRV equivalence, arrhythmia or disease detection.
