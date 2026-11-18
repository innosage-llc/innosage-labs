import { citedSummaryParagraphs, editedSummaryCitations, draftText, readSummaryGeneration, type DraftSnapshot, type SummaryGeneration } from './draftDocumentModel';
import { prepareRecorderOpen } from './recorderDraftProtocol';

export type SummaryCandidate = Readonly<{ pageId: string; generation: SummaryGeneration; basedOnRevision: number }>;
type SummarySource = SummaryGeneration['source'];

/** Select committed text at call time, not from a render or an in-progress edit. */
export async function readSummaryInput(
  source: SummarySource,
  readOriginal: () => Promise<string | undefined>,
  readRevision: () => Promise<string | undefined>,
) {
  const text = ((await (source === 'revision' ? readRevision() : readOriginal())) ?? '').trim();
  if (!text) throw new Error(source === 'revision'
    ? 'There is no saved revision for the summary.'
    : 'The selected transcript is empty.');
  return text;
}

/**
 * Keep the paid call and its resulting local write separate. A failed write can
 * take the exact same candidate back to review or acceptance without inference.
 */
export async function generateSummaryCandidate({
  metadata, document, readInput, generate,
}: {
  metadata: Omit<SummaryGeneration,'text'|'citations'|'sourceRevision'>;
  document: Pick<NativeSummaryDocument,'pageId'|'recover'>;
  readInput: () => Promise<{text:string; sourceRevision?:number}>;
  generate: (text: string) => Promise<Pick<SummaryGeneration,'text'|'citations'>>;
}): Promise<SummaryCandidate> {
  const {pageId} = document;
  const before = await document.recover();
  if (before && (before.kind !== 'summary' || before.pageId !== pageId)) throw new Error('A separate summary document is required.');
  const {text,sourceRevision} = await readInput();
  if (!text.trim()) throw new Error('The selected transcript is empty.');
  if (sourceRevision !== undefined && (metadata.source !== 'revision' ||
      !Number.isSafeInteger(sourceRevision) || sourceRevision < 1)) throw new Error('The selected transcript revision is invalid.');
  const result = await generate(text);
  const generation = readSummaryGeneration({...metadata,sourceRevision,text:result.text,citations:result.citations});
  if (!generation) throw new Error('The generated summary could not be saved.');
  return { pageId, basedOnRevision: before?.revision ?? 0, generation };
}

export function acceptSummaryCandidate(
  candidate: SummaryCandidate,
  blocks: unknown,
  document: Pick<NativeSummaryDocument,'pageId'|'replaceSummary'>,
) {
  if (candidate.pageId !== document.pageId) throw new Error('This candidate belongs to another summary document.');
  return document.replaceSummary(candidate.basedOnRevision, blocks, candidate.generation);
}

type NativeSummaryDocument = {
  pageId: string;
  recover(): Promise<DraftSnapshot | undefined>;
  replaceSummary(baseRevision: number, blocks: unknown, generation: SummaryGeneration): Promise<DraftSnapshot>;
};

function seedSummary(pageId:string, generation:SummaryGeneration) {
  const text=generation.text.replace(/\r\n?/g,'\n');
  // Keep the same paragraph/size guard as ordinary Draft seeds, including rich markup.
  if (!prepareRecorderOpen(pageId,'Meeting Summary',text)) return;
  const content=citedSummaryParagraphs(text,editedSummaryCitations(text,generation));
  const blocks=[{id:pageId,type:'tiptap',content:JSON.stringify({type:'doc',content})}];
  return prepareRecorderOpen(pageId,'Meeting Summary','',{revision:0,blocks});
}

/** Adopt an older generated summary once, without deleting the legacy source. */
export async function loadSummaryDocument(
  document: NativeSummaryDocument,
  readLegacy: () => Promise<{id: string; data: unknown} | undefined>,
) {
  const saved = await document.recover();
  if (saved) return saved;
  const legacy = await readLegacy();
  if (!legacy) return undefined;
  const generation = readSummaryGeneration(legacy.data, legacy.id);
  if (!generation) throw new Error('Could not read the previous summary.');
  const candidate = seedSummary(document.pageId,generation);
  if (!candidate) throw new Error('The previous summary is too large for Draft.');
  try {
    return await document.replaceSummary(0, candidate.blocks, generation);
  } catch (error) {
    // A second owner may have saved or migrated during the legacy read.
    const current = await document.recover();
    if (current) return current;
    throw error;
  }
}

export function saveSummaryCandidate(document: NativeSummaryDocument, candidate: SummaryCandidate) {
  if (candidate.pageId !== document.pageId) throw new Error('This candidate belongs to another summary document.');
  const seeded = seedSummary(document.pageId,candidate.generation);
  if (!seeded) throw new Error('The generated summary is too large for Draft.');
  return acceptSummaryCandidate(candidate, seeded.blocks, document);
}

export async function committedSummary(draft: Pick<NativeSummaryDocument,'recover'>) {
  const saved = await draft.recover();
  if (!saved?.generation || saved.kind !== 'summary') return undefined;
  return { snapshot: saved, text: draftText(saved) };
}
