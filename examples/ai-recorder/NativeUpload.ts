// No iOS bounded-memory uploader exists. Never load the Android native module.
export const supportsProUpload = false;
export async function uploadRecording(_url: string, _file: Blob, _headers: Record<string, string>, _signal?: AbortSignal): Promise<void> {
  throw new Error('InnoSage Pro uploads require Android. Choose staging Free access or OpenAI direct on iOS.');
}
