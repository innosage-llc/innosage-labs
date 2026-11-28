import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseVoiceIdentification } from "./ProClient.ts";

const fixtures = JSON.parse(readFileSync(new URL("./docs/voice-profile/v1.fixtures.json", import.meta.url)));
const job = fixtures.transcriptions[1];

test("wire fixtures parse without rewriting source segment order or renaming a point", () => {
  for (const { result } of fixtures.transcriptions) {
    assert.deepEqual(parseVoiceIdentification(result), result);
  }
  assert.deepEqual(parseVoiceIdentification(job.pendingRead.body), job.pendingRead.body);
  const parsed = parseVoiceIdentification(job.result);
  assert.deepEqual(parsed.segments.map((r) => r.startMs), [200, 2400, 3600, 2300]);
  assert.equal(parsed.segments[3].disposition, "unknown");
});

test("malformed or contradictory identity results cannot produce a named speaker", () => {
  const badRows = [
    { ...job.result.segments[0], embedding: [1, 2, 3] },
    { ...job.result.segments[0], segmentId: job.result.segments[1].segmentId },
    { ...job.result.segments[0], startMs: job.result.segments[0].endMs },
  ];
  for (const invalid of badRows) {
    assert.equal(parseVoiceIdentification({ ...job.result, segments: [invalid, ...job.result.segments.slice(1)] }), undefined);
  }
  const twoNames = { ...job.result.segments[0], segmentId: "separate", matchedProfileId: "vp_other" };
  assert.equal(parseVoiceIdentification({ ...job.result, segments: [...job.result.segments, twoNames] }), undefined);
  assert.equal(parseVoiceIdentification({ ...job.result, status: "failed", error: "recognizer_unavailable" }), undefined);
  assert.equal(parseVoiceIdentification({ ...job.pendingRead.body, segments: [] }), undefined);
});
