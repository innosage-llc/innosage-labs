# #127 · VoiceProfile v1 contract milestone

- Own the provider-neutral contract in the existing Recorder; #128 tracks M1.
- Wire examples are synthetic and are not a model-quality claim or service test.
- Node 24.22.2: npm run test:transcript, 42 passed. No remote CI.
- M2 must qualify pinned CAM++/sherpa on isolated staging and exercise configured recovery; M3/M4 provide the actual app and acceptance evidence.
- Preserve accepted Qwen source row order and timestamp points; never synthesize durations or named matches for point ranges.
- M3 offline client foundation only. Exact opt-in reservation acknowledgement and candidate replay binding, post-save optional identity reads, current account verification, pending/result validator and fallback. All 46 transcript tests plus typecheck passed. No calling UI, backend enablement, deployment or staging claim.
- Added typed Pro Worker enrollment/list/edit/replace/delete transport to the offline branch. It forwards only a consented bounded clip with scoped source metadata, rechecks actual Pro identity, binds retry keys and distinguishes pending from verified deletion. 47 transcript tests and typecheck; still uncalled by the existing app.
- Prepared the mocked, pure issue assignment input/reconcile layer. Its exact user-choice tuple binds content, repository, and GitHub login/ID; outgoing body excludes all speaker/profile/source metadata. It verifies actual returned assignee and never treats an unresolved or ambiguous response as permission to create again. 49 transcript and fixture tests, plus typecheck. No GitHub test operation or caller wiring.
- Tightened review findings: bind concurrent reservations and profile mutations to exact account/origin/options; confirmed-segment transport only accepts output from a supplied trusted local range clipper (absent in existing app, so fails closed). Validate 202 + pending + Retry-After before polling and 200 + terminal separately. Freeze issue authorization, target, and assignee at runtime. 50 transcript/fixture tests and typecheck.
