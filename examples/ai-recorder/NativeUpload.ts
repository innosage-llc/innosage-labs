// The bounded-memory uploader is Android-only. Never load its native module on iOS.
export const supportsProUpload = false;

export async function uploadRecording(
  _url: string,
  _file: Blob,
  _headers: Record<string, string>,
  _signal?: AbortSignal,
): Promise<void> {
  throw new Error('InnoSage Pro uploads require Android. On iOS, choose OpenAI direct or the Free gateway.');
}
