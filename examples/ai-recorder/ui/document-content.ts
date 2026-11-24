type TranscriptBlock = { timestamp?: string; text: string };

const timestamp = '(?:\\d+:)?\\d+:\\d{2}(?:\\.\\d{1,3})?';
const timedLine = new RegExp(`^\\[(${timestamp})(?:\\s*[-–]\\s*${timestamp})?\\]\\s*(.*)$`);

export function transcriptReaderBlocks(text: string): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  let block: TranscriptBlock | undefined;
  for (const line of text.split(/\r?\n/)) {
    const timed = timedLine.exec(line.trim());
    if (timed) {
      block = { timestamp: timed[1], text: timed[2] };
      blocks.push(block);
    } else if (!line.trim()) {
      if (block?.timestamp === undefined || block?.text) block = undefined;
    } else if (block) {
      block.text += (block.text ? '\n' : '') + line;
    } else {
      block = { text: line };
      blocks.push(block);
    }
  }
  return blocks;
}

type SummarySection = { heading?: string; start: number; end: number };
const sectionHeading = /^(?:#{1,6}\s+)?(?:\*\*)?(Overview|Key decisions|Decisions?|Action items|Open questions):?(?:\*\*)?:?$/i;

/** Keep section offsets in Unicode characters, as used by saved source citations. */
export function summaryReaderSections(text: string): SummarySection[] {
  const sections: SummarySection[] = [];
  let heading: string | undefined;
  let offset = 0;
  let start = 0;
  for (const line of text.split('\n')) {
    const match = sectionHeading.exec(line.trim());
    const next = offset + Array.from(line).length + 1;
    if (match) {
      if (offset > start || heading) sections.push({ heading, start, end: offset });
      heading = match[1];
      start = next;
    }
    offset = next;
  }
  const end = Math.max(start, offset - 1);
  if (end > start || heading) sections.push({ heading, start, end });
  return sections;
}
