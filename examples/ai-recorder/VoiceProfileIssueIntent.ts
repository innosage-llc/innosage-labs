import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/** No network operations. This is the bound draft/reconciliation contract. */
export type GitHubTarget = { owner: string; repo: string };
export type GitHubIdentity = { login: string; id: number };
export type IssueContent = { title: string; body: string };
export type RecorderActionDraft = {
  recordingRef: string;
  sourceStartMs: number;
  sourceEndMs: number;
  speakerProfileId?: string;
  proposedOwnerProfileId?: string;
  target: GitHubTarget;
  content: IssueContent;
  assignee: GitHubIdentity;
};
export type ExplicitChoice = {
  userConfirmed: true;
  target: GitHubTarget;
  content: IssueContent;
  assignee: GitHubIdentity;
};
export type FrozenCreate = Readonly<{
  target: Readonly<GitHubTarget>;
  title: string;
  body: string;
  marker: string;
  assignee: Readonly<GitHubIdentity>;
}>;
export type IssueObservation = {
  number: number;
  body: string | null;
  assignees: GitHubIdentity[];
  pull_request?: unknown;
};
export type Disposition =
  | { state: "verified"; issueNumber: number }
  | { state: "assignee_mismatch"; issueNumber: number }
  | { state: "unresolved" };

const entity = /^[A-Za-z0-9_.-]{1,100}$/;
const login = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const privateOperation = /^[a-f0-9]{32}$/;
const markerPattern = /<!-- recorder-action-v1:[a-f0-9]{32} -->/;

function equalTarget(a: GitHubTarget, b: GitHubTarget) {
  return a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase();
}
function equalIdentity(a: GitHubIdentity, b: GitHubIdentity) {
  return a.id === b.id && a.login.toLowerCase() === b.login.toLowerCase();
}

export function freezeConfirmedCreate(
  draft: RecorderActionDraft,
  userChoice: ExplicitChoice,
  operation: string,
): FrozenCreate {
  if (!userChoice || userChoice.userConfirmed !== true ||
      !equalTarget(draft.target, userChoice.target) ||
      draft.content.title !== userChoice.content.title ||
      draft.content.body !== userChoice.content.body ||
      !equalIdentity(draft.assignee, userChoice.assignee))
    throw new Error("Confirm the issue content, repository, and exact assignee.");
  if (!entity.test(draft.target.owner) || !entity.test(draft.target.repo) ||
      !login.test(draft.assignee.login) || !Number.isSafeInteger(draft.assignee.id) ||
      draft.assignee.id <= 0 || !privateOperation.test(operation) ||
      draft.target.owner === "." || draft.target.owner === ".." ||
      draft.target.repo === "." || draft.target.repo === ".." ||
      !draft.content.title.trim() || draft.content.title.length > 256 ||
      draft.content.body.length > 60_000 || markerPattern.test(draft.content.body))
    throw new Error("The confirmed issue draft is invalid.");
  const marker = `<!-- recorder-action-v1:${operation} -->`;
  // The recording/time/profile fields stay local; only the explicit content
  // plus a non-biometric correlation marker enters the request body.
  return Object.freeze({
    target: Object.freeze({ owner: draft.target.owner, repo: draft.target.repo }),
    title: draft.content.title, body: `${draft.content.body}\n\n${marker}`, marker,
    assignee: Object.freeze({ login: draft.assignee.login, id: draft.assignee.id }),
  });
}

export function verifyCreatedIssue(
  issued: Pick<FrozenCreate, "target" | "marker" | "assignee">,
  observedRepository: GitHubTarget,
  observed: IssueObservation,
): Disposition {
  if (!equalTarget(issued.target, observedRepository) ||
      !Number.isSafeInteger(observed.number) || observed.number <= 0 ||
      observed.pull_request !== undefined ||
      !(observed.body ?? "").split(/\r?\n/).some(line => line === issued.marker))
    return { state: "unresolved" };
  if (observed.assignees.length !== 1 || !equalIdentity(observed.assignees[0], issued.assignee))
    return { state: "assignee_mismatch", issueNumber: observed.number };
  return { state: "verified", issueNumber: observed.number };
}

/** Do not let zero or multiple observations authorize another create. */
export function reconcileUncertainCreate(
  issued: Pick<FrozenCreate, "target" | "marker" | "assignee">,
  observedRepository: GitHubTarget,
  observations: IssueObservation[],
): Disposition {
  const found = observations
    .map(observed => verifyCreatedIssue(issued, observedRepository, observed))
    .filter(result => result.state !== "unresolved");
  return found.length === 1 ? found[0] : { state: "unresolved" };
}

export type PendingIssue = Readonly<{
  schema: "recorder-issue-write/v1";
  state: "may_have_sent";
  target: Readonly<GitHubTarget>;
  assignee: Readonly<GitHubIdentity>;
  marker: string;
  contentSha256: string;
}>;

export interface IssueIntentStore {
  /**
   * Atomic compare-and-create for the marker; reliably persisted before the
   * promise resolves. An uncertain or failing write MUST NOT return true.
   * A single stable marker represents a single confirmed approval.
   */
  claim(intent: PendingIssue): Promise<boolean>;
  read(marker: string): Promise<unknown>;
}

interface IssueBoundary {
  store: IssueIntentStore;
  /** Explicitly approved, single external create, with no automatic retry. */
  createOnce(approved: FrozenCreate): Promise<void>;
  /** Authoritative, read-only, exact repository/marker lookup. */
  observe(target: Readonly<GitHubTarget>, marker: string): Promise<{
    complete: true;
    repository: GitHubTarget;
    issues: IssueObservation[];
  } | { complete: false }>;
}

const unresolved = { state: "unresolved" } as const;
const digestPattern = /^[a-f0-9]{64}$/;

function hasKeys(value: unknown, keys: string[]) {
  return !!value && typeof value === "object" && Object.keys(value).length === keys.length &&
    keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function safePending(value: unknown, marker: string): PendingIssue | undefined {
  const v = value as PendingIssue | null;
  if (!v || !hasKeys(v, ["schema", "state", "target", "assignee", "marker", "contentSha256"]) ||
      v.schema !== "recorder-issue-write/v1" || v.state !== "may_have_sent" || v.marker !== marker ||
      typeof v.contentSha256 !== "string" || !digestPattern.test(v.contentSha256) ||
      !hasKeys(v.target, ["owner", "repo"]) || !hasKeys(v.assignee, ["login", "id"]) ||
      ![v.target.owner, v.target.repo].every(part =>
        typeof part === "string" && entity.test(part) && part !== "." && part !== "..") ||
      typeof v.assignee.login !== "string" || !login.test(v.assignee.login) ||
      !Number.isSafeInteger(v.assignee.id) || v.assignee.id <= 0) return;
  return v;
}

function binding(approved: FrozenCreate): PendingIssue {
  return Object.freeze({
    schema: "recorder-issue-write/v1",
    state: "may_have_sent",
    marker: approved.marker,
    contentSha256: bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([approved.title, approved.body])))),
    target: Object.freeze({ owner: approved.target.owner.toLowerCase(), repo: approved.target.repo.toLowerCase() }),
    assignee: Object.freeze({ login: approved.assignee.login.toLowerCase(), id: approved.assignee.id }),
  });
}

function sameApproval(a: PendingIssue, b: PendingIssue) {
  return a.marker === b.marker && a.contentSha256 === b.contentSha256 &&
    a.target.owner === b.target.owner && a.target.repo === b.target.repo &&
    a.assignee.login === b.assignee.login && a.assignee.id === b.assignee.id;
}

async function observeOnly(
  intent: PendingIssue, io: Pick<IssueBoundary, "observe">,
): Promise<Disposition> {
  try {
    // Do not use the create response as proof of actual assignment or as
    // authority to fix a wrong assignee.
    const read = await io.observe(intent.target, intent.marker);
    if (read.complete !== true || !Array.isArray(read.issues) || read.issues.length > 1000)
      return unresolved;
    return reconcileUncertainCreate(intent, read.repository, read.issues);
  } catch {
    return unresolved;
  }
}

export async function executeConfirmedIssue(
  draft: RecorderActionDraft, choice: ExplicitChoice, operation: string, io: IssueBoundary,
): Promise<Disposition> {
  const approved = freezeConfirmedCreate(draft, choice, operation);
  const intent = binding(approved);
  let first: boolean;
  try {
    first = await io.store.claim(intent);
    // Only this caller can create after a positively confirmed durable claim.
    if (first !== true) {
      const prior = safePending(await io.store.read(intent.marker), intent.marker);
      return prior && sameApproval(prior, intent) ? observeOnly(prior, io) : unresolved;
    }
  } catch {
    return unresolved;
  }

  try {
    await io.createOnce(approved);
  } catch {
    // The connection may have lost the reply after the create took effect.
    // The durable claim still exists and cannot authorize any retry.
  }
  return observeOnly(intent, io);
}

export async function recoverUncertainIssue(
  operation: string, io: Pick<IssueBoundary, "store" | "observe">,
): Promise<Disposition> {
  if (typeof operation !== "string" || !privateOperation.test(operation)) return unresolved;
  const marker = `<!-- recorder-action-v1:${operation} -->`;
  try {
    const pending = safePending(await io.store.read(marker), marker);
    return pending ? observeOnly(pending, io) : unresolved;
  } catch {
    return unresolved;
  }
}
