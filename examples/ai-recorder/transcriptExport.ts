import type { DraftSnapshot } from './draftDocumentModel';

/** Export committed editor paragraphs as distinct Markdown paragraphs. Existing
 * blank separator paragraphs from a plain-text seed already supply the gap. */
export function draftTranscriptMarkdown(snapshot: DraftSnapshot): string {
  function unsupported(): never {
    throw new Error('The saved editor content cannot be exported completely.');
  }

  function render(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return unsupported();
    const node = value as { type?: unknown; text?: unknown; content?: unknown };
    if (typeof node.type !== 'string') return unsupported();
    if (node.type === 'text') {
      if (typeof node.text !== 'string' || node.content !== undefined) return unsupported();
      return node.text;
    }
    if (node.text !== undefined) return unsupported();
    if (node.type === 'hardBreak' || node.type === 'horizontalRule') {
      if (node.content !== undefined) return unsupported();
      return node.type === 'hardBreak' ? '  \n' : '---';
    }

    const textBlock = ['paragraph', 'heading', 'codeBlock'].includes(node.type);
    if (textBlock && node.content === undefined) return '';
    if (!Array.isArray(node.content)) return unsupported();
    if (textBlock) {
      const inline = node.content.map(child => {
        if (child?.type !== 'text' && child?.type !== 'hardBreak') return unsupported();
        return render(child);
      });
      return inline.join('');
    }
    // An unfamiliar atom can hold visible text in attributes. Refuse the
    // snapshot until we know how to represent that node without losing it.
    if (!['doc', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem',
      'table', 'tableRow', 'tableCell', 'tableHeader'].includes(node.type)) return unsupported();
    const children = node.content.map(render);

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
    ? '## Speaker attribution\n\n' + attribution + '\n\n## Transcript\n\n' : '';
  return {
    filename: title + '.md',
    markdown: `# ${title}\n\n${dateLabel}: ${timestamp}\n\nTranscript source: ${basis}\n\n${timeline}${body}`,
  };
}
