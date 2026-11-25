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
