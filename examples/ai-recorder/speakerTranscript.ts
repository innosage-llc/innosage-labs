type Word = { timestamp: string; start: number; speaker: string; text: string };

/** Reflow the saved word timeline using the original transcript's punctuation and spacing. */
export function readableSpeakerTranscript(original: string, attributed?: string): string {
  if (!attributed) return original;
  const words: Word[] = [];
  for (const line of attributed.split('\n')) {
    const match = /^\[(\d+:\d{2}\.\d{3})\] (Speaker [1-8]|Unknown speaker): (.*)$/.exec(line);
    if (!match) return attributed;
    const [minutes, seconds] = match[1].split(':').map(Number);
    words.push({ timestamp: match[1], start: Math.round(minutes * 60_000 + seconds * 1000), speaker: match[2], text: match[3] });
  }
  const body = original.replace(/^\[((?:\d+:)?\d{2}:\d{2}(?:\.\d{1,3})?) - ((?:\d+:)?\d{2}:\d{2}(?:\.\d{1,3})?)\]\s*/gm, '').trimEnd();
  const decoration = (char: string) => /[\s\p{P}]/u.test(char);
  const letters = (text: string) => Array.from(text).filter(char => !decoration(char)).join('');
  if (letters(words.map(word => word.text).join('')) !== letters(body)) return attributed;

  const chars = Array.from(body);
  const paragraphs: (Word & { lastStart: number })[] = [];
  let cursor = 0;
  for (const word of words) {
    const expected = Array.from(letters(word.text));
    if (!expected.length) continue;
    const begin = cursor;
    for (const char of expected) {
      while (cursor < chars.length && decoration(chars[cursor])) cursor++;
      if (chars[cursor] !== char) return attributed;
      cursor++;
    }
    while (cursor < chars.length && decoration(chars[cursor])) cursor++;
    const fragment = chars.slice(begin, cursor).join('');
    const previous = paragraphs.at(-1);
    // Match Draft's readable bounds. Legacy rows retain only word start times,
    // so pause detection conservatively uses the gap between those starts.
    if (previous && previous.speaker === word.speaker && word.start >= previous.lastStart &&
        word.start - previous.lastStart <= 1000 && word.start - previous.start <= 10_000 &&
        previous.text.length + fragment.length <= 160) {
      previous.text += fragment;
      previous.lastStart = word.start;
    } else {
      paragraphs.push({ ...word, text: fragment, lastStart: word.start });
    }
  }
  if (cursor !== chars.length || !paragraphs.length) return attributed;
  return paragraphs.map(row => `[${row.timestamp}] ${row.speaker}: ${row.text.trim()}`).join('\n\n');
}
