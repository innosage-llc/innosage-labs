export type DraftKind = 'transcript' | 'summary';
export type SummarySourceCitation = {start?:number; end:number; url:string; title:string};
export type SummaryGeneration = {
  id: string;
  recipe: string;
  model: string;
  source: 'original' | 'revision';
  sourceRevision?: number;
  text: string;
  citations?: SummarySourceCitation[];
  effort?: 'low' | 'medium' | 'high' | 'xhigh';
  webSearch?: boolean;
};
export type DraftBlock = { id: string; type: 'tiptap'; content: string };
export type DraftSnapshot = {
  version: 1;
  pageId: string;
  kind: DraftKind;
  revision: number;
  blocks: [DraftBlock];
  generation?: SummaryGeneration;
};

const validToken = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
const asRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function nonempty(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

function safeCitation(v: unknown): SummarySourceCitation | undefined {
  if (!asRecord(v) || !nonempty(v.url, 4096) || typeof v.title !== 'string' || v.title.length > 500 ||
      typeof v.end !== 'number' || !Number.isSafeInteger(v.end) || v.end < 1) return;
  const start = v.start;
  if (start !== undefined && (typeof start !== 'number' || !Number.isSafeInteger(start) || start < 0 || start >= v.end)) return;
  // Match the raw authority before parsing: not all mobile URL implementations
  // normalize encoded/user-info host syntax consistently.
  const authority = /^https?:\/\/([^/?#]+)/i.exec(v.url)?.[1];
  if (!authority || /[@%]/.test(authority) || /[\s\\\u0000-\u001f\u007f]/.test(v.url)) return;
  try {
    const url = new URL(v.url);
    if (!['https:', 'http:'].includes(url.protocol.toLowerCase()) || !url.hostname || url.username || url.password) return;
  } catch { return; }
  return {url:v.url, title:v.title, end:v.end, ...(typeof start === 'number' ? {start} : {})};
}

export function readSummaryGeneration(value: unknown, legacyId?: string): SummaryGeneration | undefined {
  if (!asRecord(value)) return;
  const id = value.id ?? legacyId;
  if (!validToken(id) || !nonempty(value.recipe, 240) || !nonempty(value.model, 240) ||
      !nonempty(value.text, 800_000) || (value.source !== 'original' && value.source !== 'revision')) return;
  const sourceRevision = value.sourceRevision;
  if (sourceRevision !== undefined && (value.source !== 'revision' || typeof sourceRevision !== 'number' ||
      !Number.isSafeInteger(sourceRevision) || sourceRevision < 1)) return;
  const effort = value.effort;
  const citations = Array.isArray(value.citations)
    ? value.citations.slice(0, 100).flatMap(item => {
        const citation = safeCitation(item);
        return citation ? [citation] : [];
      }) : undefined;
  return {id, recipe:value.recipe, model:value.model, source:value.source, text:value.text,
    ...(typeof sourceRevision === 'number' ? {sourceRevision} : {}),
    ...(citations ? {citations} : {}),
    ...(effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'xhigh' ? {effort} : {}),
    ...(typeof value.webSearch === 'boolean' ? {webSearch:value.webSearch} : {}),
  };
}

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
  if (!blocks || blocks[0].id !== key.pageId) return;
  const generation = key.kind === 'summary' ? readSummaryGeneration(value.generation) : undefined;
  if (value.generation !== undefined && !generation) return;
  return {...key, version: 1, revision: value.revision, blocks, ...(generation ? {generation} : {})};
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

  function write(baseRevision: number, input: unknown, replacement?: SummaryGeneration): Promise<DraftSnapshot> {
    return order(async () => {
      if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) throw new Error('Invalid base revision.');
      const blocks = blockArray(input);
      if (!blocks || blocks[0].id !== key.pageId) throw new Error('Invalid Draft document.');
      const saved = await current();
      if ((saved?.revision ?? 0) !== baseRevision) {
        if (saved?.revision === baseRevision + 1 && JSON.stringify(saved.blocks) === JSON.stringify(blocks) &&
            (!replacement || JSON.stringify(saved.generation) === JSON.stringify(replacement))) return saved;
        throw new Error('Draft revision changed.');
      }
      const generation = replacement ?? saved?.generation;
      const next: DraftSnapshot = {version: 1, ...key, revision: baseRevision + 1, blocks,
        ...(generation ? {generation} : {})};
      const json = JSON.stringify(next);
      if (json.length > 4_000_000) throw new Error('Draft document is too large.');
      await disk.write(json);
      return next;
    });
  }
  return {
    pageId: key.pageId,
    recover: () => order(current),
    commit: (baseRevision: number, input: unknown) => write(baseRevision, input),
    replaceSummary(baseRevision: number, input: unknown, value: SummaryGeneration) {
      const generation = key.kind === 'summary' ? readSummaryGeneration(value) : undefined;
      if (!generation) return Promise.reject(new Error('Invalid summary generation.'));
      return write(baseRevision, input, generation);
    },
  };
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


/** Re-anchor an unambiguous original quote in edited text. Never retain stale offsets. */
type LinkedQuote = {url:string; title:string; start?:number; end?:number};
export function editedSummaryCitations(text: string, generation: SummaryGeneration): LinkedQuote[] {
  const original = Array.from(generation.text);
  return (generation.citations ?? []).flatMap(value => {
    const candidate = safeCitation(value);
    if (!candidate) return [];
    const basic = {url:candidate.url, title:candidate.title};
    if (candidate.start === undefined || candidate.end > original.length) return basic;
    const quote = original.slice(candidate.start, candidate.end).join('').trim();
    if (!quote) return basic;
    const first = text.indexOf(quote);
    if (first < 0 || text.indexOf(quote, first + 1) !== -1) return basic;
    return {...basic, start:Array.from(text.slice(0,first)).length,
      end:Array.from(text.slice(0,first) + quote).length};
  });
}

/** Only this allow-listed projection may be considered for publication. */
export function summaryPublicProjection(snapshot: DraftSnapshot) {
  if (snapshot.kind !== 'summary' || !snapshot.generation) throw new Error('A committed summary is required.');
  const text = draftText(snapshot).trim();
  if (!text) throw new Error('The edited summary is empty.');
  return {title:'Meeting Summary', text, citations:editedSummaryCitations(text, snapshot.generation)};
}

/** Assign only verified non-overlapping quotes to editor links. Other sources remain in the sources view. */
export function citedSummaryParagraphs(text:string, citations:LinkedQuote[]) {
  const anchors = citations.flatMap(c => c.start !== undefined && c.end !== undefined
    ? [{start:c.start,end:c.end,url:c.url}] : []).sort((a,b)=>a.start-b.start);
  let pos=0, index=0;
  return text.split('\n').map(line => {
    const chars=Array.from(line), limit=pos+chars.length;
    const content:Array<{type:'text';text:string;marks?:[{type:'link';attrs:{href:string}}]}>=[];
    let cursor=pos;
    while(index<anchors.length && anchors[index].start<limit) {
      const a=anchors[index], start=Math.max(pos,a.start), end=Math.min(limit,a.end);
      if(start>=cursor && end>start) {
        if(start>cursor) content.push({type:'text',text:chars.slice(cursor-pos,start-pos).join('')});
        content.push({type:'text',text:chars.slice(start-pos,end-pos).join(''),marks:[{type:'link',attrs:{href:a.url}}]});
        cursor=end;
      }
      if(a.end>limit) break;
      index++;
    }
    if(cursor<limit) content.push({type:'text',text:chars.slice(cursor-pos).join('')});
    pos=limit+1;
    return {type:'paragraph' as const,...(content.length?{content}:{})};
  });
}

/** The canonical native page wins over a legacy sidecar, even if the legacy file is unreadable. */
export async function transcriptSeed(readCanonical:()=>Promise<DraftSnapshot|undefined>, readLegacy:()=>Promise<string|undefined>) {
  const page=await readCanonical();
  return page ? draftText(page) : readLegacy();
}
