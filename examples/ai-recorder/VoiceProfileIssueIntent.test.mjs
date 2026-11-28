import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { executeConfirmedIssue, freezeConfirmedCreate, recoverUncertainIssue, reconcileUncertainCreate, verifyCreatedIssue } from "./VoiceProfileIssueIntent.ts";

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
  assert.throws(() => { issued.title = "Unconfirmed"; }, TypeError);
  assert.throws(() => { issued.target.repo = "unconfirmed"; }, TypeError);
  assert.throws(() => { issued.assignee.id = 99; }, TypeError);
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

function fakeDurableBoundary() {
  // A serialized fake durable store shared by every executor/restart, with an
  // atomic insert point. No actual service sends or observes anything.
  const records = new Map();
  const calls = [];
  let observed;
  const store = {
    async read(marker) {
      const raw = records.get(marker);
      return raw === undefined ? undefined : JSON.parse(raw);
    },
    async claim(intent) {
      if (records.has(intent.marker)) return false;
      records.set(intent.marker, JSON.stringify(intent));
      return true;
    },
  };
  const connect = () => ({
    store,
    async createOnce(issue) {
      assert.equal((await store.read(issue.marker)).state, "may_have_sent");
      calls.push(["create", issue]);
      observed = { complete:true, repository: issue.target, issues:[
        { number: 16, body: issue.body, assignees: [issue.assignee] },
      ] };
    },
    async observe(target, marker) {
      calls.push(["observe", target, marker]);
      return observed ?? { complete:true, repository:target, issues:[] };
    },
  });
  return { records, calls, connect, setObserved: value => { observed = value; } };
}

test("explicit approval and atomic durable claim precede a single create; storage excludes Recorder material", async () => {
  const f = fakeDurableBoundary();
  await assert.rejects(() => executeConfirmedIssue(draft, { ...choice, userConfirmed:false }, key, f.connect()), /Confirm/);
  assert.equal(f.records.size, 0);
  assert.deepEqual(f.calls, []);
  const injectedDraft = {
    ...draft, target: {...draft.target, voiceName:"private-recorded-speaker"},
    assignee: {...draft.assignee, voiceFingerprint:"private-synthetic-fingerprint"},
  };
  const outcome = await executeConfirmedIssue(injectedDraft, choice, key, f.connect());
  assert.deepEqual(outcome, {state:"verified", issueNumber:16});
  const issued = f.calls[0][1];
  const raw = f.records.get(issued.marker);
  assert.deepEqual(JSON.parse(raw), {
    schema:"recorder-issue-write/v1", state:"may_have_sent",
    marker:issued.marker, target:draft.target, assignee:draft.assignee,
    contentSha256:createHash("sha256").update(JSON.stringify([issued.title, issued.body])).digest("hex"),
  });
  assert.doesNotMatch(raw, /private-synthetic-recording|private-recorded-speaker|private-synthetic-fingerprint|Approved synthetic content|Mock issue|vp_speaker|vp_owner/);
  assert.doesNotMatch(JSON.stringify(issued), /private-synthetic-recording|private-recorded-speaker|private-synthetic-fingerprint/);
});

test("lost reply and fresh executor reconcile exact repository, marker, actual assignment without duplicate create", async () => {
  const f = fakeDurableBoundary();
  const first = f.connect();
  const apply = first.createOnce;
  first.createOnce = async issue => { await apply(issue); throw Error("fixture reply lost"); };
  first.observe = async () => ({ complete:false });
  const recovered = { state:"verified", issueNumber:16 };
  assert.deepEqual(await executeConfirmedIssue(draft, choice, key, first), {state:"unresolved"});
  assert.deepEqual(await recoverUncertainIssue(key, f.connect()), recovered);
  assert.deepEqual(await executeConfirmedIssue(draft, choice, key, f.connect()), recovered);
  const sent = f.calls.find(([kind]) => kind === "create")[1];
  const candidate = { number:16, body:sent.body, assignees:[sent.assignee] };
  for (const [repository, issues, expected] of [
    [{...draft.target, repo:"other"}, [candidate], {state:"unresolved"}],
    [draft.target, [{...candidate, body:"Not the exact marker"}], {state:"unresolved"}],
    [draft.target, [], {state:"unresolved"}],
    [draft.target, [candidate, {...candidate, number:17}], {state:"unresolved"}],
    [draft.target, [{...candidate, assignees:[{...sent.assignee,id:99}]}],
      {state:"assignee_mismatch", issueNumber:16}],
    [draft.target, [{...candidate, assignees:[...candidate.assignees, {login:"other",id:99}]}],
      {state:"assignee_mismatch", issueNumber:16}],
  ]) {
    f.setObserved({complete:true, repository, issues});
    assert.deepEqual(await recoverUncertainIssue(key, f.connect()), expected);
  }
  const changed = {...draft, content:{ ...draft.content, body:"Changed and reapproved" }};
  assert.deepEqual(await executeConfirmedIssue(changed, {...choice, content:changed.content}, key, f.connect()),
    {state:"unresolved"});
  assert.equal(f.calls.filter(([kind]) => kind === "create").length, 1);
});

test("concurrent dispatch and ambiguous durable claim never authorize a second create", async () => {
  const f = fakeDurableBoundary();
  const first = f.connect();
  let unblock;
  const create = first.createOnce;
  first.createOnce = async input => {
    await new Promise(resolve => { unblock = resolve; });
    await create(input);
  };
  const original = executeConfirmedIssue(draft, choice, key, first);
  while (!unblock) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await executeConfirmedIssue(draft, choice, key, f.connect()), {state:"unresolved"});
  unblock();
  assert.deepEqual(await original, {state:"verified", issueNumber:16});
  const key2 = "cd".repeat(16);
  const uncertain = f.connect();
  uncertain.store = { ...uncertain.store, async claim(intent) {
    await f.connect().store.claim(intent);
    throw Error("fixture durable acknowledgment lost");
  }};
  assert.deepEqual(await executeConfirmedIssue(draft, choice, key2, uncertain), {state:"unresolved"});
  assert.deepEqual(await recoverUncertainIssue(key2, f.connect()), {state:"unresolved"});
  assert.deepEqual(await executeConfirmedIssue(draft, choice, key2, f.connect()), {state:"unresolved"});
  assert.equal(f.calls.filter(([kind]) => kind === "create").length, 1);
});

test("corrupt stored intent never triggers observation or create", async () => {
  const f = fakeDurableBoundary();
  const marker = freezeConfirmedCreate(draft, choice, key).marker;
  f.records.set(marker, JSON.stringify({ marker, state:"may_have_sent", recorderText:"do not read" }));
  assert.deepEqual(await recoverUncertainIssue(key, f.connect()), {state:"unresolved"});
  assert.deepEqual(await executeConfirmedIssue(draft, choice, key, f.connect()), {state:"unresolved"});
  assert.deepEqual(f.calls, []);
});
