# Lite Wearable API 20 companion contract

`protocol.js` and `bridge.js` are the watch-side ES5-compatible counterpart of Android
`WatchWireCodec`. The actual Huawei transport and SHA-256 implementation must be injected from the
approved Compatible SDK; no SDK symbol or scope is guessed here.

The contract enforces protocol v1, a 960-byte payload/1 KiB wire budget, monotonic sequences,
SHA-256 integrity, acknowledgements and immutable disconnect buffering. Sessions remain explicitly
started, consent-bound and duration/power-budgeted by the phone-side domain contract. It never uses
the API 24 Lite Health Store on GT6 API 20.
