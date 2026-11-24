/** No network operations. This is the bound draft/reconciliation contract. */
type GitHubTarget = { owner: string; repo: string };
type GitHubIdentity = { login: string; id: number };
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
type ExplicitChoice = {
  userConfirmed: true;
  target: GitHubTarget;
  content: IssueContent;
  assignee: GitHubIdentity;
};
type FrozenCreate = {
  target: GitHubTarget;
  title: string;
  body: string;
  marker: string;
  assignee: GitHubIdentity;
};
type IssueObservation = {
  number: number;
  body: string | null;
  assignees: GitHubIdentity[];
  pull_request?: unknown;
};
type Disposition =
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
  return {
    target: { ...draft.target }, title: draft.content.title,
    body: `${draft.content.body}\n\n${marker}`, marker,
    assignee: { ...draft.assignee },
  };
}

export function verifyCreatedIssue(
  issued: FrozenCreate,
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
  issued: FrozenCreate,
  observedRepository: GitHubTarget,
  observations: IssueObservation[],
): Disposition {
  const found = observations
    .map(observed => verifyCreatedIssue(issued, observedRepository, observed))
    .filter(result => result.state !== "unresolved");
  return found.length === 1 ? found[0] : { state: "unresolved" };
}
