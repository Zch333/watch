# Heart rate 1.0.0

- Intended use: median/min/max heart rate, platform resting-heart-rate trend and descriptive time above 120 BPM.
- Inputs: qualified HR/RHR observations in BPM; provenance and consent required.
- Method/output: median/extrema and bounded adjacent-window duration; BPM/minute.
- Quality gate: 20–260 BPM semantic range; rejected samples excluded.
- Evidence: E1 engineering; platform RHR remains vendor-computed. Device/context validation pending.
- Failure modes: motion artefact, sparse sampling, exercise/rest context confusion, late sync.
- License: proprietary application code; descriptive statistics are unrestricted.
- Prohibited claims: arrhythmia, cardiac diagnosis, safe/unsafe exercise or medication advice.
