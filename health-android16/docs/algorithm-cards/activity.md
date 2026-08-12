# Activity 1.0.0

- Intended use: personal step, active-minute and sedentary-minute summaries.
- Inputs: platform `STEP_COUNT`, `ACTIVE_MINUTES`, `SEDENTARY_MINUTES`; wrist/platform provenance required.
- Method/output: qualified-window sums in count/minute units.
- Quality gate: rejected observations excluded; empty inputs produce no metric.
- Evidence: E1 engineering. Validate GT6/Huawei aggregation semantics and day boundaries.
- Failure modes: double-counted overlapping summaries, delayed sync, timezone/day-boundary changes.
- License: proprietary application code; arithmetic formula is not restricted.
- Prohibited claims: activity minutes are not exercise capacity, disease or treatment evidence.
