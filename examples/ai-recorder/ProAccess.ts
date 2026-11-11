import { fetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import { File, FileMode } from "expo-file-system";
import { sha256 } from "@noble/hashes/sha2.js";
import { ProClient } from "./ProClient";
import { uploadRecording } from "./NativeUpload";

const worker = process.env.EXPO_PUBLIC_PRO_WORKER_URL;
const router = process.env.EXPO_PUBLIC_PRO_ROUTER_URL;
export const proClient =
  worker && router
    ? new ProClient(
        worker,
        router,
        (url, init) => fetch(url, init),
        SecureStore,
        uploadRecording,
      )
    : undefined;

export async function hashRecording(file: File, signal?: AbortSignal) {
  const digest = sha256.create();
  const handle = file.open(FileMode.ReadOnly);
  try {
    while (true) {
      signal?.throwIfAborted();
      const chunk = await handle.readBytes(1024 * 1024);
      if (!chunk.length) break;
      digest.update(chunk);
    }
    return Array.from(digest.digest(), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } finally {
    handle.close();
  }
}
