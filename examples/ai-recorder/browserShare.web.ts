// A file is shared only after the user's gesture. A download works offline
// when the browser has no file-capable Web Share implementation.
export async function shareOrDownload(file: globalThis.File, download = false) {
  if (!download && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) throw error; }
    return 'dismissed' as const;
  }
  const url = URL.createObjectURL(file);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 60_000); }
  return 'saved' as const;
}
