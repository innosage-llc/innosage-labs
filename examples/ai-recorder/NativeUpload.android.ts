import { requireNativeModule } from "expo";
import { randomUUID } from "expo-crypto";
import type { File } from "expo-file-system";

type UploadModule = {
  recordingDurationMillis(uri: string): Promise<number | null>;
  clipConfirmedRecording(id: string, uri: string, expectedBytes: number, startMs: number, endMs: number): Promise<ArrayBuffer>;
  upload(
    id: string,
    url: string,
    uri: string,
    capability: string,
    hash: string,
    size: number,
  ): Promise<number>;
  cancel(id: string): void;
  release(id: string): void;
};

export async function recordingDurationMillis(file: { uri: string }): Promise<number | undefined> {
  const native = requireNativeModule<UploadModule>('RecorderUpload');
  return (await native.recordingDurationMillis(file.uri)) ?? undefined;
}

export async function uploadRecording(
  url: string,
  file: Blob,
  headers: Record<string, string>,
  signal?: AbortSignal,
) {
  const native = requireNativeModule<UploadModule>("RecorderUpload");
  signal?.throwIfAborted();
  const id = randomUUID();
  const cancel = () => native.cancel(id);
  const timeout = setTimeout(cancel, 30 * 60_000);
  signal?.addEventListener("abort", cancel);
  try {
    const status = await native.upload(
      id,
      url,
      (file as File).uri,
      headers.Authorization.replace(/^Bearer /, ""),
      headers["X-Content-SHA256"],
      file.size,
    );
    if (status < 200 || status >= 300)
      throw new Error(
        "Upload was not accepted. Retry to recover the same operation.",
      );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
    native.release(id);
  }
}

export const supportsProUpload = true;


/** App-owned original and confirmed source reference must already be bound by the calling flow. */
export async function clipConfirmedRecording(
  original: { uri: string; size: number }, startMs: number, endMs: number, signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; mimeType: "audio/wav" }> {
  const native = requireNativeModule<UploadModule>("RecorderUpload");
  signal?.throwIfAborted();
  const id = randomUUID();
  const cancel = () => native.cancel(id);
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) { cancel(); signal.throwIfAborted(); }
    const clip = await native.clipConfirmedRecording(id, original.uri, original.size, startMs, endMs);
    signal?.throwIfAborted();
    if (!(clip instanceof ArrayBuffer) || clip.byteLength < 44 || clip.byteLength > 6 * 1024 * 1024)
      throw new Error("Could not clip the selected recording interval");
    return { bytes: new Uint8Array(clip), mimeType: "audio/wav" };
  } finally {
    signal?.removeEventListener("abort", cancel);
    native.release(id);
  }
}
