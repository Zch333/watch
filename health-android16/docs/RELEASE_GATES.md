# Release and research gates

The checked-in app is intentionally dormant. Do not change a build flag or evidence literal without
attaching the referenced artifact to the release record.

| Gate | Checked-in | Required evidence |
|---|---:|---|
| `MOVE25_HEALTH_RELEASE_ENABLED` | false | release owner approval after every row below |
| device capability | false | GT6 + target phone probes and supported matrix |
| formal scopes | false | Huawei console approval and consent text |
| data quality | false | replay, missingness, semantics and device-version validation |
| algorithm cards | false | intended use, inputs, quality, evidence, license, failure modes |
| privacy impact | false | minimization, retention, threat model and policy/legal review |
| AI safety | false | red-flag/diagnosis/drug/numeric/prompt-injection zero-failure suite |
| deletion/export | false | local/cloud deletion and readable export end-to-end evidence |
| power budget | false | typical/workout/sleep A/B against uninstalled GT6 baseline |
| Firebase App Check | false | production provider, enforcement and abuse-test evidence |
| research release | false | separate consent, ethics assessment, de-identification, dataset card and isolation |

Build flags only permit the feature to become active; the user health switch and purpose consent are
still mandatory. App Functions and AI have independent opt-ins. L4 medical functionality has no
consumer activation path.
