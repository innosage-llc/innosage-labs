import assert from "node:assert/strict";
import { test } from "node:test";
import { freezeConfirmedCreate, reconcileUncertainCreate, verifyCreatedIssue } from "./VoiceProfileIssueIntent.ts";

const draft = {
  recordingRef: "private-synthetic-recording", sourceStartMs: 2000, sourceEndMs: 6000,
  speakerProfileId: "vp_speaker", proposedOwnerProfileId: "vp_owner",
  target: { owner: "example", repo: "mock-repo" },
  content: { title: "Mock issue", body: "Approved synthetic content." },
  assignee: { login: "example-user", id: 144 },
};
const choice = {
  userConfirmed: true, content: draft.content, assignee: draft.assignee, target: draft.target,
};
const key = "ab".repeat(16);

test("the confirmed create payload carries a private operation marker, not speaker attributes", () => {
  const issued = freezeConfirmedCreate(draft, choice, key);
  assert.equal(issued.assignee.login, "example-user");
  assert.match(issued.body, /recorder-action-v1/);
  assert.doesNotMatch(JSON.stringify(issued), /vp_speaker|vp_owner|private-synthetic-recording|sourceStartMs/);
  assert.throws(() => freezeConfirmedCreate(draft, { ...choice, userConfirmed: false }, key), /Confirm/);
  assert.throws(() => freezeConfirmedCreate(draft, { ...choice, assignee: { ...choice.assignee, id: 99 } }, key), /Confirm/);
  assert.throws(() => freezeConfirmedCreate(draft, { ...choice, target: { ...choice.target, repo: "other" } }, key), /Confirm/);
  assert.throws(() => freezeConfirmedCreate(draft, { ...choice, content: { ...choice.content, body: "Unconfirmed" } }, key), /Confirm/);
});

test("uncertain create never permits a duplicate; successful reconciliation verifies the returned actual assignee", () => {
  const issued = freezeConfirmedCreate(draft, choice, key);
  const observed = { number: 17, body: issued.body, assignees: [draft.assignee] };
  assert.deepEqual(verifyCreatedIssue(issued, draft.target, observed), { state: "verified", issueNumber: 17 });
  assert.deepEqual(reconcileUncertainCreate(issued, draft.target, [observed]), { state: "verified", issueNumber: 17 });
  assert.deepEqual(reconcileUncertainCreate(issued, draft.target, [{ ...observed, assignees: [] }]),
    { state: "assignee_mismatch", issueNumber: 17 });
  assert.deepEqual(reconcileUncertainCreate(issued, draft.target, [observed, { ...observed, number: 18 }]), { state: "unresolved" });
  assert.deepEqual(reconcileUncertainCreate(issued, draft.target, []), { state: "unresolved" });
  assert.deepEqual(verifyCreatedIssue(issued, { ...draft.target, repo: "other" }, observed), { state: "unresolved" });
});
