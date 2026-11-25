import type { DraftSnapshot } from './draftDocumentModel';

/** Export committed editor paragraphs as distinct Markdown paragraphs. Existing
 * blank separator paragraphs from a plain-text seed already supply the gap. */
export function draftTranscriptMarkdown(snapshot: DraftSnapshot): string {
  function unsupported(): never {
    throw new Error('The saved editor content cannot be exported completely.');
  }

  // The embedded editor can also store media and custom atoms. Only accept
  // transcript structures whose complete visible text we can reproduce.
  const blocks = ['paragraph', 'heading', 'codeBlock', 'horizontalRule', 'blockquote',
    'bulletList', 'orderedList', 'taskList', 'table', 'toggleDetailsV2'];
  const allowed: Record<string, string[]> = {
    doc: blocks, blockquote: blocks, listItem: blocks, taskItem: blocks,
    bulletList: ['listItem'], orderedList: ['listItem'], taskList: ['taskItem'],
    table: ['tableRow'], tableRow: ['tableCell', 'tableHeader'], tableCell: blocks, tableHeader: blocks,
    toggleDetailsV2: ['toggleSummaryV2', 'toggleContentV2'], toggleContentV2: blocks, toggleSummaryV2: ['text', 'hardBreak'],
    paragraph: ['text', 'hardBreak'], heading: ['text', 'hardBreak'], codeBlock: ['text'],
  };

  function render(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return unsupported();
    const node = value as { type?: unknown; text?: unknown; content?: unknown };
    if (typeof node.type !== 'string') return unsupported();
    if (node.type === 'text') {
      if (typeof node.text !== 'string' || !node.text.length || node.content !== undefined) return unsupported();
      return node.text;
    }
    if (node.text !== undefined) return unsupported();
    if (node.type === 'hardBreak' || node.type === 'horizontalRule') {
      if (node.content !== undefined) return unsupported();
      return node.type === 'hardBreak' ? '  \n' : '---';
    }
    if (!Object.prototype.hasOwnProperty.call(allowed, node.type)) return unsupported();
    const textBlock = ['paragraph', 'heading', 'codeBlock', 'toggleSummaryV2'].includes(node.type);
    if (textBlock && node.content === undefined) return '';
    if (!Array.isArray(node.content) || (!textBlock && !node.content.length)) return unsupported();
    if (['listItem', 'taskItem'].includes(node.type) && node.content[0]?.type !== 'paragraph') return unsupported();
    if (node.type === 'toggleDetailsV2' && (node.content.length !== 2 ||
      node.content[0]?.type !== 'toggleSummaryV2' || node.content[1]?.type !== 'toggleContentV2')) return unsupported();
    const permitted = allowed[node.type];
    const children = node.content.map(child => {
      if (!permitted.includes(child?.type)) return unsupported();
      return render(child);
    });
    if (textBlock) return children.join('');

    const pieces: string[] = [];
    for (const [index, child] of children.entries()) {
      if (index > 0) pieces.push(child && children[index - 1] ? '\n\n' : '\n');
      pieces.push(child);
    }
    return pieces.join('');
  }

  const doc = JSON.parse(snapshot.blocks[0].content);
  if (doc?.type !== 'doc' || !Array.isArray(doc.content)) return unsupported();
  return render(doc);
}

type TranscriptRevision = { text: string; revision: number };

type SavedTranscript = {
  readDraft(): Promise<TranscriptRevision | undefined>;
  readLegacy(): Promise<string | undefined>;
  readOriginal(): Promise<{ text: string; attribution?: string } | undefined>;
};

// Preserve literal source that Markdown would otherwise consume as markup, e.g.
// a reference definition on the final line. Ordinary transcript paragraphs stay
// editable as paragraphs. Fenced text retains the original characters verbatim.
function literalParagraphs(text: string): string {
  return text.split(/((?:\r?\n){2,})/).map((part, index) => {
    if (!part || index % 2) return part;
    const withoutTimestamps = part.replace(/^\[[\d:.]+(?:[ \t]*[-–][ \t]*[\d:.]+)?\](?=[ \t]+[\p{L}\p{N}])/gmu, '');
    const markup = /[\\`*_~\[\]<>|$]|&(?:#\w+|[a-z]+);|^(?:[ \t]{4}|\t| {0,3}(?:#{1,6}(?:\s|$)|[-+=](?:\s|$)|-{2,}|={2,}|\d+[.)]\s))/im;
    const softLines = part.replace(/\r?\n$/, '').split(/\r?\n/).slice(0, -1);
    if (!markup.test(withoutTimestamps) && !softLines.some(line => !line.endsWith('  '))) return part;
    let width = 3;
    for (const ticks of part.matchAll(/`+/g)) width = Math.max(width, ticks[0].length + 1);
    const fence = '`'.repeat(width);
    return fence + 'text\n' + part + (part.endsWith('\n') ? '' : '\n') + fence;
  }).join('');
}

/** Only an absent source permits trying the preceding generation of storage. */
export async function transcriptMarkdown(label: string, recordingName: string, saved: SavedTranscript) {
  const canonical = await saved.readDraft();
  const legacy = canonical === undefined ? await saved.readLegacy() : undefined;
  const original = canonical === undefined && legacy === undefined ? await saved.readOriginal() : undefined;
  const body = canonical?.text ?? legacy ?? original?.text;
  if (!body?.trim()) throw new Error('The selected transcript has no saved text to export.');

  // Keep a single display name for Android's file picker, Sharesheet and Draft.
  // 52 Unicode scalars plus prefix and extension fit within a 255-byte filename.
  const name = Array.from(label.replace(/[\p{Cc}\p{Cf}/\\:*?"<>|]/gu, ' ')
    .replace(/\s+/g, ' ').trim()).slice(0, 52).join('').replace(/^[. ]+|[. ]+$/g, '');
  const title = name ? 'Transcript - ' + name : 'AI Recorder transcript';
  const match = /^(Recording|Import)-(\d+)-/.exec(recordingName);
  const date = new Date(match ? Number(match[2]) : NaN);
  const timestamp = Number.isFinite(date.getTime()) ? date.toISOString() : 'Unknown';
  const dateLabel = match?.[1] === 'Import' ? 'Imported' : 'Recorded';
  const basis = canonical ? `Edited (Draft revision ${canonical.revision})` : legacy !== undefined ? 'Edited (saved revision)' : 'Original';
  // Original timestamps and paragraph boundaries can differ from the separate
  // speaker timeline. Preserve both when present, keeping the original body last.
  const attribution = original?.attribution;
  const timeline = attribution?.trim() && attribution !== body
    ? '## Speaker attribution\n\n' + literalParagraphs(attribution) + '\n\n## Transcript\n\n' : '';
  return {
    filename: title + '.md',
    markdown: `# ${title}\n\n${dateLabel}: ${timestamp}\n\nTranscript source: ${basis}\n\n${timeline}${literalParagraphs(body)}`,
  };
}
