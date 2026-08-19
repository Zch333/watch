# Workout and training load 1.0.0

- Intended use: workout time/distance/calories, descriptive intensity load and one-minute HR recovery.
- Inputs: qualified workout duration/distance/calories and time-aligned heart rate.
- Method/output: sums; duration × bounded HR-derived intensity score; peak minus first HR at +60s.
- Quality gate: load requires duration+HR; recovery requires a post-peak +60s sample.
- Evidence: E1 engineering; not interchangeable with Huawei/proprietary or clinical load models.
- Failure modes: mixed workouts, missing cooldown HR, sensor lag, estimated calories and user-specific HR zones.
- License: proprietary application code.
- Prohibited claims: readiness clearance, overtraining diagnosis or safe return-to-play decision.
