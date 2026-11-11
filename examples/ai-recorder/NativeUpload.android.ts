import { requireNativeModule } from "expo";
import { randomUUID } from "expo-crypto";
import type { File } from "expo-file-system";

type UploadModule = {
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
