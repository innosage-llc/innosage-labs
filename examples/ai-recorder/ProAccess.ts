import { fetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import { File, FileMode } from "expo-file-system";
import { sha256 } from "@noble/hashes/sha2.js";
import { ProClient } from "./ProClient";
import { uploadRecording } from "./NativeUpload";
import { services, serviceForWorker, SERVICE_KEY, serviceId, type ServiceId } from "./ServiceConfig";

const clients = new Map<ServiceId, ProClient>();
export function clientForService(id: ServiceId) {
  let client = clients.get(id);
  if (!client) {
    const config = services[id];
    client = new ProClient(config.workerURL, config.routerURL,
      (url, init) => fetch(url, init), SecureStore, uploadRecording);
    clients.set(id, client);
  }
  return client;
}
export function clientForOperation(operation: { workerURL: string }) {
  return clientForService(serviceForWorker(operation.workerURL));
}
export async function selectedService() {
  return serviceId(await SecureStore.getItemAsync(SERVICE_KEY));
}
export async function selectService(id: ServiceId) {
  await SecureStore.setItemAsync(SERVICE_KEY, id);
}

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
