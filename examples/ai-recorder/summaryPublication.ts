import type { DraftSnapshot } from './draftDocumentModel';
import { buildSummaryPublishSnapshot } from './summaryPublishSnapshot';

// Sharing is independent of the transcription provider. This milestone is staging only.
export const summaryShareSite = 'https://draft-staging.innosage.co';
const api = 'https://api-staging.draft.innosage.co';
const publicId = /^pub_rec_[a-f0-9]{32}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
class ShareResponseError extends Error {
  readonly status: number;
  constructor(status: number) { super('Draft sharing request failed (HTTP ' + status + ').'); this.status = status; }
}
type Status = 'unconfirmed' | 'active' | 'withdrawing' | 'unpublished';
type Owner = { key: string; id: string; status: Status; created: number; revision: number };
type Dependencies = {
  pageId: string;
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  recover(): Promise<DraftSnapshot | undefined>;
  randomUUID(): string;
  sha256Hex(value: string): Promise<string>;
  request: typeof fetch;
};
const busy = new Set<string>();

export function summaryPublication(d: Dependencies) {
  const url = (id: string) => summaryShareSite + '/preview/' + id;
  async function load(): Promise<Owner | undefined> {
    const raw = await d.read();
    if (raw === null) return;
    const state = JSON.parse(raw) as Owner | null;
    if (!state || !uuid.test(state.key) || !publicId.test(state.id) ||
        !['active','unpublished','unconfirmed','withdrawing'].includes(state.status) ||
        !Number.isSafeInteger(state.created) || state.created <= 0 ||
        !Number.isSafeInteger(state.revision) || state.revision < 1)
      throw new Error('The saved publication needs recovery.');
    return state;
  }
  const store = (s: Owner) => d.write(JSON.stringify(s));
  async function once<T>(operation: () => Promise<T>) {
    if (busy.has(d.pageId)) throw new Error('A sharing action is already in progress.');
    busy.add(d.pageId);
    try { return await operation(); } finally { busy.delete(d.pageId); }
  }
  async function post(path: string, body: object) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_,reject) => {
      timer = setTimeout(() => {
        reject(new Error('Draft sharing timed out. The last request was not confirmed.'));
        controller.abort();
      },30_000);
    });
    try {
      return await Promise.race([deadline,(async () => {
        const response = await d.request(api + path, { method:'POST', headers:{'Content-Type':'application/json'},
          redirect:'error', credentials:'omit', body:JSON.stringify(body), signal:controller.signal });
        if (!response.ok) throw new ShareResponseError(response.status);
        return response.json();
      })()]);
    } finally { clearTimeout(timer); }
  }
  return {
    // Inspecting / reopening never authenticates, publishes, or contacts the service.
    async status() {
      const s = await load();
      return s ? { status:s.status, revision:s.revision, url:s.status === 'active' ? url(s.id) : undefined } : undefined;
    },
    publish(reviewed: Pick<DraftSnapshot, 'pageId'|'revision'>) {
      return once(async () => {
        const latest = await d.recover();
        if (!latest || latest.pageId !== d.pageId) throw new Error('Open the saved summary before publishing.');
        const previous = await load();
        // If an earlier write may still be in flight, it must not race a newer edit.
        // Withdraw its exact ID first; the server's terminal receipt also protects late requests.
        if (previous?.status === 'unconfirmed') throw new Error('The last request is unconfirmed. Withdraw that link before publishing again.');
        if (previous?.status === 'withdrawing') throw new Error('Finish withdrawing the last link first.');
        const resume = previous && previous.status !== 'unpublished';
        const key = resume ? previous.key : d.randomUUID();
        if (!uuid.test(key)) throw new Error('Could not prepare a publisher identity.');
        const id = 'pub_rec_' + (await d.sha256Hex('recorder-summary-v1:' + key)).slice(0,32);
        if (resume && previous.id !== id) throw new Error('The saved publication needs recovery.');
        const created = resume ? previous.created : Date.now();
        const snapshot = buildSummaryPublishSnapshot(latest, reviewed, id, created);
        const owner: Owner = {key,id,created,revision:reviewed.revision,status:'unconfirmed'};
        // Write ownership before the request, so process death does not lose the ability to withdraw.
        await store(owner);
        let result;
        try {
          result = await post('/api/publish', {pageId:id,localPageId:id,publicPageId:id,
            intent:'publish_exact', browserPublisherKey:key, snapshot});
        } catch (error) {
          // Confirmed validation/auth/quota rejections have no server-side publication.
          if (error instanceof ShareResponseError && [400,401,403,413,429].includes(error.status))
            await store(previous ?? {...owner,status:'unpublished'});
          throw error;
        }
        if (result?.success !== true || result.status !== 'active' || result.ownerType !== 'browser' ||
            result.ownerManaged !== true || result.publicPageId !== id)
          throw new Error('The service did not confirm a manageable summary link.');
        // Ignore payload-supplied URLs; only a confirmed ID on the configured site is shareable.
        await store({...owner,id:result.publicPageId,status:'active'});
        return url(result.publicPageId);
      });
    },
    unpublish() {
      return once(async () => {
        const s = await load();
        if (!s || s.status === 'unpublished') return;
        await store({...s,status:'withdrawing'});
        const result = await post('/api/publish/unpublish',{pageId:s.id,browserPublisherKey:s.key,exact:true});
        if (result?.success !== true || result.status !== 'unpublished')
          throw new Error('The service did not confirm withdrawal.');
        await store({...s,status:'unpublished'});
      });
    },
  };
}
