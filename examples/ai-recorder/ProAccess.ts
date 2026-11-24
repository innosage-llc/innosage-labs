import { fetch } from "expo/fetch";
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { File, FileMode } from "expo-file-system";
import { sha256 } from "@noble/hashes/sha2.js";
import { ProClient } from "./ProClient";
import { VoiceProfileIntents } from "./VoiceProfileIntents";
import { voiceProfileManagement } from "./VoiceProfileManagement";
import { voiceProfileStageEnabled } from "./VoiceProfileFlow";
import { supportsProUpload, uploadRecording } from "./NativeUpload";
import { services, serviceForWorker, SERVICE_KEY, serviceId, type ServiceId, type InnoSageServiceId } from "./ServiceConfig";

const clients = new Map<InnoSageServiceId, ProClient>();
export function clientForService(id: InnoSageServiceId) {
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

/** The UI mounts this only for its locally loaded, currently configured account. */
export function voiceProfileManagerForStage(accountScope: string) {
  if (!supportsProUpload || !voiceProfileStageEnabled('staging'))
    throw new Error('Voice profiles are unavailable in this build.');
  const client = clientForService('staging');
  const scope = { workerURL: client.workerURL, accountScope };
  return voiceProfileManagement(client, scope, new VoiceProfileIntents(SecureStore, scope, randomUUID),
    bytes => Array.from(sha256(bytes), byte => byte.toString(16).padStart(2, '0')).join(''));
}
