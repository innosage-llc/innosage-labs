import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Fixture integrity only: this does not exercise a live recognizer or authorize
// any fixture identifiers as actual participants.
const fixtures = JSON.parse(
  readFileSync(new URL("./docs/voice-profile/v1.fixtures.json", import.meta.url)),
);
const doc = readFileSync(new URL("./docs/voice-profile/v1.md", import.meta.url), "utf8");

test("enrollment examples bind consent to the chosen clip and cover same-key recovery and conflicts", () => {
  assert.ok(doc.includes(fixtures.version));
  const [direct, confirmed] = fixtures.registration.requests;
  assert.deepEqual([direct.metadata.sample.source, confirmed.metadata.sample.source], [
    "direct", "confirmed_segment",
  ]);
  for (const enrollment of [direct, confirmed]) {
    assert.equal(enrollment.metadata.consent.scope, "voice_profile_enrollment");
    assert.equal(enrollment.metadata.consent.participantConfirmed, true);
    assert.equal(enrollment.response.status, "active");
    assert.equal(enrollment.response.revision, 1);
  }
  assert.notEqual(direct.key, confirmed.key);
  assert.notEqual(direct.response.profileId, confirmed.response.profileId);
  assert.equal(confirmed.metadata.sample.endMs - confirmed.metadata.sample.startMs, 3000);
  const source = fixtures.transcriptions.find(({ recordingRef }) => recordingRef === confirmed.metadata.sample.recordingRef);
  const segment = source.result.segments.find(({ segmentId }) => segmentId === confirmed.metadata.sample.segmentId);
  assert.equal(segment.startMs, confirmed.metadata.sample.startMs);
  assert.equal(segment.endMs, confirmed.metadata.sample.endMs);
  assert.equal(fixtures.profileEdits.sampleMetadata.expectedRevision, direct.response.revision);
  assert.equal(fixtures.profileEdits.sampleMetadata.consent.participantConfirmed, true);
  assert.equal(fixtures.profileEdits.patch.expectedRevision, direct.response.revision + 1);
  assert.equal(fixtures.profileEdits.patch.status, "disabled");
  const [retry, conflict] = fixtures.registration.recovery;
  assert.equal(retry.restart && retry.responseLost, true);
  assert.equal(retry.expectedSameProfileId, fixtures.registration.requests[retry.requestIndex].response.profileId);
  assert.notEqual(conflict.changedAudio, fixtures.registration.requests[conflict.requestIndex].audio);
  assert.equal(conflict.expectedStatus, 409);
});

test("recordings retain local speaker identity and usable anonymous results if matching fails", () => {
  const dispositions = new Set();
  for (const job of fixtures.transcriptions) {
    const options = job.reserve.voiceIdentification;
    assert.equal(options.contract, fixtures.version);
    assert.equal(job.result.contract, fixtures.version);
    assert.equal(job.reserve.diarization.enabled, true);
    assert.match(job.reserve.idempotencyKey, /^recorder-transcription-v2-\d{10}-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
    assert.deepEqual(job.acknowledgement, {
      decision: "created",
      diarization: job.reserve.diarization,
      speakerResultContract: "draft-speaker-attribution/v1",
      voiceIdentification: { contract: options.contract },
    });
    assert.ok(job.original.trim());
    assert.equal(new Set(job.result.segments.map(({ segmentId }) => segmentId)).size, job.result.segments.length);
    for (const item of job.result.segments) {
      assert.ok(Number.isSafeInteger(item.startMs) && item.startMs >= 0);
      assert.ok(Number.isSafeInteger(item.endMs) && item.endMs >= item.startMs);
      if (item.startMs === item.endMs) assert.equal(item.disposition, "unknown");
      assert.equal(typeof item.text, "string");
      dispositions.add(item.disposition);
      assert.deepEqual(Object.keys(item).sort(), [
        "disposition", "endMs", "segmentId", "speakerId", "startMs", "text",
        ...(item.disposition === "matched" ? ["matchedProfileId"] : []),
      ].sort());
      if (item.disposition === "matched") {
        assert.ok(item.speakerId);
        assert.ok(job.resolvedCandidateIds.includes(item.matchedProfileId));
        assert.equal(job.result.status, "completed");
      }
    }
  }
  const [first, second, failed] = fixtures.transcriptions;
  assert.equal(first.result.segments[0].matchedProfileId, second.result.segments[0].matchedProfileId);
  assert.notEqual(first.result.segments[0].speakerId, second.result.segments[0].speakerId);
  assert.deepEqual(dispositions, new Set(["matched", "needs_review", "unknown"]));
  assert.equal(failed.result.status, "failed");
  assert.equal(failed.result.error, "recognizer_unavailable");
  assert.equal(failed.result.segments[0].text, failed.original);
  assert.ok(failed.result.segments[0].speakerId);
  assert.deepEqual(second.recovery.reorderedCandidates, second.reserve.voiceIdentification.candidateProfileIds.toSorted());
  assert.deepEqual(second.recovery.expectedSameSegmentIds, second.result.segments.map(({ segmentId }) => segmentId));
  assert.equal(second.recovery.expectedResubmissions, 0);
  assert.deepEqual(second.result.segments.map(({ startMs }) => startMs), [200, 2400, 3600, 2300]);
  assert.equal(second.result.segments[3].speakerId, "SPEAKER_02");
  assert.equal(second.recovery.expectedDecision, "idempotent");
  assert.deepEqual(second.pendingRead, {
    httpStatus: 202,
    retryAfterSeconds: 2,
    body: { contract: fixtures.version, status: "pending" },
    originalAlreadyAvailable: true,
    cleanupStarted: false,
  });
});

test("examples distinguish account, environment, and revocation before or after material deletion", () => {
  const owner = fixtures.scopes[fixtures.registration.scope];
  for (const scopeCase of fixtures.isolation) {
    assert.notDeepEqual(fixtures.scopes[scopeCase.scope], owner);
    assert.equal(scopeCase.expectedStatus, 404);
  }
  assert.notEqual(fixtures.routerIsolation[0].sessionId, fixtures.routerIsolation[1].sessionId);
  for (const scopeCase of fixtures.routerIsolation) {
    assert.match(scopeCase.sessionId, /^tx_/);
    assert.equal(scopeCase.controlRole, "other_job");
    assert.equal(scopeCase.expectedStatus, 403);
  }
  const { deletion } = fixtures;
  assert.deepEqual(deletion.responseStatuses, [202, 204, 204]);
  assert.equal(deletion.scope, fixtures.registration.scope);
  assert.equal(deletion.profileId, fixtures.registration.requests[0].response.profileId);
  assert.deepEqual(deletion.beforeCleanup, { eligible: false, materialDeleted: false });
  for (const check of [deletion.afterCleanup, deletion.restored]) {
    assert.deepEqual(check, { eligible: false, materialDeleted: true });
  }
  for (const check of [deletion.queuedJobResult, deletion.priorServerResultReplay]) {
    assert.deepEqual(check, { disposition: "unknown" });
  }
  assert.ok(deletion.priorLocalRevision);
});

test("fixtures carry no provider/auth/storage fields at any public boundary", () => {
  function check(node) {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      assert.doesNotMatch(key, /embedding|voiceprint|vector|provider.?token|authorization|credential|similarity|score/i);
      check(value);
    }
  }
  check(fixtures);
});
