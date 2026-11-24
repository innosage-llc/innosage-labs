// The bounded-memory uploader is Android-only. Never load its native module on iOS.
export const supportsProUpload = false;

export async function recordingDurationMillis(_file: { uri: string }): Promise<number | undefined> {
  return undefined;
}

export async function uploadRecording(
  _url: string,
  _file: Blob,
  _headers: Record<string, string>,
  _signal?: AbortSignal,
): Promise<void> {
  throw new Error('InnoSage Pro uploads require Android. On iOS, choose OpenAI direct or the Free gateway.');
}

export async function clipConfirmedRecording(
  _original: { uri: string; size: number; sha256: string },
  _startMs: number, _endMs: number, _signal?: AbortSignal,
): Promise<{bytes: Uint8Array; mimeType: "audio/wav"}> {
  throw new Error('Confirmed voice clips are only available on Android.');
}
