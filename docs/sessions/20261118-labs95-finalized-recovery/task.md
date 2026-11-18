# Finalized Android recording recovery

Refs https://github.com/innosage-llc/innosage-labs/issues/95.

Baseline: main `cf682434b861da97053225036118654aa0c948f1`.

- Actual dedicated API 36 Android baseline: normal save + actual Library playback PASS; interruption before registration FAIL (no matching Library entry on either offline cold launch); interruption after move PASS (same bytes/identity and actual three-marker playback in both new processes); truncated pending file rejection FAIL.
- Existing control recording identity and bytes retained. Synthetic input only; no provider traffic or private editor bundle.
- Implement Android stable capture name in persistent storage, finalized-container/AAC checks, atomic registration and startup reconciliation. Existing Library filenames/URIs and associated documents remain untouched. Active-capture recovery and old-cache migration are outside scope.
- Typecheck and 108 product tests PASS. First candidate A runtime failed: passing already-flattened options to SDK prepare normalized away AAC settings, yielding AMR; strict admission preserved it unlisted. Corrected preparation to pass the original HIGH_QUALITY preset. Rerun full matrix including explicit AAC codec assertion. Full local three-platform CI and independent review pending.
- Keep issue OPEN; deliver a DRAFT PR and exact APK/hash for separate physical-phone verification after engineering gates. No merge, auto-merge, cloud CI, deploy or issue closure.
