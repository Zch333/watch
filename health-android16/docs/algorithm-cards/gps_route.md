# GPS route 1.0.0

- Intended use: descriptive route distance and average pace.
- Inputs: time-ordered valid latitude/longitude points with explicit location consent.
- Method/output: Haversine segment sum in km and elapsed minutes/km.
- Quality gate: coordinate validity, approved route access and route privacy review.
- Evidence: E1 engineering; compare with reference routes across GT6 modes.
- Failure modes: urban canyon, pauses, teleport points, missing segments and altitude ignored in distance.
- License: Haversine formula/public domain; project implementation.
- Prohibited claims: exact surveying, personal safety or medical exercise clearance.
