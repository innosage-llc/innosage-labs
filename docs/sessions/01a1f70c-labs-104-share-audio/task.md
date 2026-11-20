# Labs #104

Refs https://github.com/innosage-llc/innosage-labs/issues/104

Lead-owned checkpoint for local M4A sharing. The service stages a byte-for-byte
copy under the app cache, then invokes the native share sheet. It holds recent
copies for receiving apps and confines cleanup to its own stale cache entries.
Recorder has one in-flight share at a time. The Web entry uses its own adapter.

The Library action component retains the existing Transcript action at this
checkpoint. The Share audio UI is the next V6-scoped change. Local typechecking
and platform/filename tests passed. Exact-candidate native receiving-app
verification and review are pending.
