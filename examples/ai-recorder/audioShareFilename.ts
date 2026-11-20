export function audioShareFilename(label: string): string {
  const clean = label.trim().replace(/\.m4a$/i, '')
    .replace(/[\p{Cc}\p{Cf}/\\:*?"<>|]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Bound the UTF-8 byte length even for four-byte code points.
  const stem = Array.from(clean).slice(0, 56).join('').replace(/^[. ]+|[. ]+$/g, '');
  return stem ? `AI Recorder - ${stem}.m4a` : 'AI Recorder.m4a';
}
