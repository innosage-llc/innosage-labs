# Android personal OpenAI transcription

Refs Labs #35 and #43. Android uses a device-held OpenAI Platform project key.
Model access preflight has no audio payload. A new M4A under 25 MB is submitted
directly to OpenAI and its result and revisions are saved locally. Manual audio
playback uses the original file. Existing InnoSage job bindings remain supported.

TypeScript and 16 offline regression checks pass. Actual transcription and
saved-result verification on the founder's device remain acceptance steps.
