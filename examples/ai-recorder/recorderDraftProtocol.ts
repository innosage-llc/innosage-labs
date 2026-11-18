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
  if (value.type === 'flushed' && typeof value.ok === 'boolean' && revision(value.flushId) && value.flushId > 0)
    return {type:'flushed' as const, ok:value.ok, flushId:value.flushId};
  if (value.type === 'save' && revision(value.baseRevision) && revision(value.requestId) &&
      value.requestId > 0 && Array.isArray(value.blocks)) {
    return {type:'save' as const, requestId:value.requestId, baseRevision:value.baseRevision, blocks:value.blocks};
  }
}
