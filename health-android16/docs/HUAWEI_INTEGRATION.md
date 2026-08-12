# Huawei approved integration

## Why the native implementation is injected

Huawei Health Service Kit, Extended Health and Wear Engine artifacts, constants, scopes and access
are application/account/region/approval dependent. The default source therefore provides a complete
anti-corruption interface plus an explicit `UnlinkedHuaweiNativeClient`; it does not invent an AAR
coordinate or symbol. Unsupported/approval errors are part of the UI and domain contract.

## Approval-time implementation checklist

1. Freeze Huawei account, app ID, package, signing certificate and callback configuration.
2. Obtain current official Android AAR/repository instructions for Health Service Kit, Extended
   Health and Wear Engine. Store approved local AARs under ignored `local-sdk/` if Huawei requires it.
3. Implement `HuaweiNativeClient` in an approval-specific source set using only constants present in
   that SDK. Populate `approvedCatalog()` from the actual granted scopes and data types.
4. Inject it with `HuaweiNativeClientProvider.install()` before `Application.onCreate`; do not use
   reflection or the unlinked implementation in a release build.
5. Configure `HUAWEI_PEER_PACKAGE` and the 64-hex signing certificate fingerprint. Validate both
   peers before accepting P2P messages.
6. Run the A/B/C probes for every group and record device model, GT6 firmware, Huawei Health version,
   phone/OS, region, API, returned unit/semantics, latency, disconnect/reboot and error codes.
7. Keep GT6 on API 20. Do not import API 24 `@hms.health.store`/`@hms.health.service` into the GT6
   companion. The included JS contract accepts an injected approved Wear Engine Lite transport.

## Conformance requirements

- Stable platform record IDs and cursors; repeated reads must not duplicate the ledger.
- Canonical value JSON exactly matches `HuaweiRecordNormalizer`: scalar, series, route or external BP.
- Pseudonymized device identity; no name/UDID in logs or cloud object keys.
- Real-time heart rate is a user-started, consent-bound session of 5–1800 seconds.
- Sensor sessions reject passive mode, over-budget duration/rate, disconnected devices and low battery.
- P2P uses protocol v1, SHA-256, monotonic sequence, 960-byte payload/1 KiB wire ceiling and ACK replay.

No “perfectly supported” claim is valid until the matching capability probe and GT6 device evidence
pass. Until then the application is deliberately dormant.
