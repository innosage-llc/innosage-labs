const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const revision = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

export function parseRecorderEvent(raw: string, session: string, pageId: string) {
  if (typeof raw !== 'string' || raw.length > 4_000_000) return;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return; }
  if (!record(value) || value.version !== 1) return;
  if (value.type === 'ready' && typeof value.revision === 'string' && /^[a-f0-9]{40}$/.test(value.revision))
    return {type:'ready' as const, sourceRevision:value.revision};
  if (value.type === 'error' && (value.session === session || value.session === undefined) &&
      (value.code === 'schema' || value.code === 'render'))
    return {type:'error' as const};
  if (value.session !== session || value.pageId !== pageId) return;
  if (value.type === 'opened') return {type:'opened' as const};
  if (value.type === 'flushed' && typeof value.ok === 'boolean' && (!value.ok || value.sealed === true) &&
      revision(value.flushId) && value.flushId > 0)
    return {type:'flushed' as const, ok:value.ok, flushId:value.flushId};
  if (value.type === 'save' && revision(value.baseRevision) && revision(value.requestId) &&
      value.requestId > 0 && Array.isArray(value.blocks)) {
    return {type:'save' as const, requestId:value.requestId, baseRevision:value.baseRevision, blocks:value.blocks};
  }
}

const OPEN_BLOCK_LIMIT = 3_990_000;

export function recorderDraftTitle(title: string) {
  return title.length <= 480 ? title : title.slice(0, 479) + '…';
}

type OpeningSnapshot = {revision:number; blocks:unknown[]};

/** Mirror the local editor's serialized document budget before issuing an opening request. */
export function prepareRecorderOpen(pageId: string, title: string, plainText: string, snapshot?: OpeningSnapshot) {
  let blocks = snapshot?.blocks;
  if (!blocks) {
    if (plainText.length > OPEN_BLOCK_LIMIT) return;
    let lines = 1;
    for (const _ of plainText.matchAll(/\r\n?|\n/g)) if (++lines > 140_000) return;
    blocks = [{id:pageId, type:'tiptap', content:JSON.stringify({
      type:'doc',
      content:plainText.split(/\r\n?|\n/).map(line => ({
        type:'paragraph', ...(line ? {content:[{type:'text', text:line}]} : {}),
      })),
    })}];
  }
  if (JSON.stringify(blocks).length > OPEN_BLOCK_LIMIT) return;
  return {type:'open', pageId, title:recorderDraftTitle(title), revision:snapshot?.revision ?? 0, blocks};
}
