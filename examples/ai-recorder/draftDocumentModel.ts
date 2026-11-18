export type DraftKind = 'transcript' | 'summary';
export type DraftBlock = { id: string; type: 'tiptap'; content: string };
export type DraftSnapshot = {
  version: 1;
  pageId: string;
  kind: DraftKind;
  revision: number;
  blocks: [DraftBlock];
};

const validToken = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
const asRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function blockArray(input: unknown): [DraftBlock] | undefined {
  if (!Array.isArray(input) || input.length !== 1) return;
  const block: unknown = input[0];
  if (!asRecord(block) || !validToken(block.id) || block.type !== 'tiptap' ||
      typeof block.content !== 'string' || block.content.length > 3_990_000) return;
  try {
    const content: unknown = JSON.parse(block.content);
    if (!asRecord(content) || content.type !== 'doc' || !Array.isArray(content.content)) return;
  } catch {
    return;
  }
  const blocks: [DraftBlock] = [{id: block.id, type: 'tiptap', content: block.content}];
  return JSON.stringify(blocks).length <= 3_990_000 ? blocks : undefined;
}

export function parseDraftSnapshot(raw: string, key: {pageId: string; kind: DraftKind}): DraftSnapshot | undefined {
  if (raw.length > 4_000_000) return;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return; }
  if (!asRecord(value) || value.version !== 1 || value.pageId !== key.pageId || value.kind !== key.kind ||
      typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 1) return;
  const blocks = blockArray(value.blocks);
  return blocks ? {...key, version: 1, revision: value.revision, blocks} : undefined;
}

type DraftKey = {pageId: string; kind: DraftKind};
type Storage = {read(): Promise<string | null>; write(contents: string): Promise<void>};
const owners = new Map<string, Promise<unknown>>();

export function draftStore(key: DraftKey, disk: Storage) {
  function order<T>(action: () => Promise<T>) {
    const previous = owners.get(key.pageId) ?? Promise.resolve();
    const result = previous.then(action);
    const lane = result.catch(() => {});
    owners.set(key.pageId, lane);
    void lane.then(() => { if (owners.get(key.pageId) === lane) owners.delete(key.pageId); });
    return result;
  }

  async function current() {
    const raw = await disk.read();
    if (raw === null) return undefined;
    const saved = parseDraftSnapshot(raw, key);
    if (!saved) throw new Error('The saved Draft document needs recovery.');
    return saved;
  }

  function commit(baseRevision: number, input: unknown): Promise<DraftSnapshot> {
    return order(async () => {
      if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) throw new Error('Invalid base revision.');
      const blocks = blockArray(input);
      if (!blocks || blocks[0].id !== key.pageId) throw new Error('Invalid Draft document.');
      const saved = await current();
      if ((saved?.revision ?? 0) !== baseRevision) {
        if (saved?.revision === baseRevision + 1 && JSON.stringify(saved.blocks) === JSON.stringify(blocks)) return saved;
        throw new Error('Draft revision changed.');
      }
      const next: DraftSnapshot = {version: 1, ...key, revision: baseRevision + 1, blocks};
      const json = JSON.stringify(next);
      if (json.length > 4_000_000) throw new Error('Draft document is too large.');
      await disk.write(json);
      return next;
    });
  }
  return {pageId: key.pageId, recover: () => order(current), commit};
}

export function draftText(snapshot: DraftSnapshot): string {
  function text(node: unknown): string {
    if (!asRecord(node)) return '';
    if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
    if (node.type === 'hardBreak') return '\n';
    const children = Array.isArray(node.content) ? node.content : [];
    const inline = node.type === 'paragraph' || node.type === 'heading' || node.type === 'codeBlock';
    return children.map(text).join(inline ? '' : '\n');
  }
  return text(JSON.parse(snapshot.blocks[0].content));
}
