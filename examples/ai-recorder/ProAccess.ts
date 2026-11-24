import { fetch } from "expo/fetch";
import { getRandomBytesAsync, randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { File, FileMode } from "expo-file-system";
import { sha256 } from "@noble/hashes/sha2.js";
import { ProClient, type ProOperation, type VoiceIdentification } from "./ProClient";
import { enrollConfirmedVoiceProfile } from "./VoiceProfileConfirmedEnrollment";
import { VoiceProfileIntents, type ConfirmedSourceProof } from "./VoiceProfileIntents";
import { voiceProfileManagement } from "./VoiceProfileManagement";
import { voiceProfileStageEnabled } from "./VoiceProfileFlow";
import { clipConfirmedRecording, supportsProUpload, uploadRecording } from "./NativeUpload";
import { services, serviceForWorker, SERVICE_KEY, serviceId, type ServiceId, type InnoSageServiceId } from "./ServiceConfig";

const clients = new Map<InnoSageServiceId, ProClient>();
export function clientForService(id: InnoSageServiceId) {
  let client = clients.get(id);
  if (!client) {
    const config = services[id];
    client = new ProClient(config.workerURL, config.routerURL,
      (url, init) => fetch(url, init), SecureStore, uploadRecording, undefined,
      supportsProUpload && voiceProfileStageEnabled(id));
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

const originalNamespaceKey = 'recorder.voice.confirmed.namespace.v1';
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
let loadingNamespace: Promise<string> | undefined;

function originalNamespace() {
  if (loadingNamespace) return loadingNamespace;
  const pending = (async () => {
    const existing = await SecureStore.getItemAsync(originalNamespaceKey);
    if (existing !== null) {
      if (!/^[a-f0-9]{64}$/.test(existing)) throw new Error('Voice clip identity is unavailable.');
      return existing;
    }
    const random = await getRandomBytesAsync(32);
    if (random.length !== 32) throw new Error('Voice clip identity is unavailable.');
    const value = hex(random);
    await SecureStore.setItemAsync(originalNamespaceKey, value);
    return value;
  })();
  loadingNamespace = pending;
  void pending.then(() => { loadingNamespace = undefined; }, () => { loadingNamespace = undefined; });
  return pending;
}

async function readConfirmedOriginal(uri: string, expectedSize: number, signal?: AbortSignal) {
  if (!uri.startsWith('file:///') || uri.length > 4096 || /[?#\x00-\x20]/.test(uri) ||
      !Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > 512 * 1024 * 1024)
    throw new Error('The original recording is unavailable.');
  const file = new File(uri);
  if (file.size !== expectedSize) throw new Error('The original recording has changed.');
  const digest = sha256.create();
  const handle = file.open(FileMode.ReadOnly);
  let total = 0;
  try {
    while (total < expectedSize) {
      signal?.throwIfAborted();
      const chunk = await handle.readBytes(Math.min(1024 * 1024, expectedSize - total));
      if (!chunk.length || chunk.length > expectedSize - total) throw new Error('The original recording has changed.');
      digest.update(chunk);
      total += chunk.length;
    }
    signal?.throwIfAborted();
    if ((await handle.readBytes(1)).length || file.size !== expectedSize)
      throw new Error('The original recording has changed.');
    signal?.throwIfAborted();
    return { uri, size: total, sha256: hex(digest.digest()) };
  } finally {
    handle.close();
  }
}

type ConfirmedSelection = Readonly<{ segmentId: string; displayName: string; participantConfirmed: true }>;
type ObservedVoiceResult = Exclude<VoiceIdentification, { status: 'pending' }>;

function confirmedContext(operation: ProOperation) {
  if (!supportsProUpload || !voiceProfileStageEnabled('staging') ||
      operation.workerURL !== services.staging.workerURL || operation.lane !== 'pro' ||
      operation.identifySpeakers !== true || operation.voiceIdentification === undefined)
    return;
  const candidateProfileIds = operation.voiceIdentification.candidateProfileIds;
  const boundOperation = Object.freeze({ ...operation, voiceIdentification: Object.freeze(
    candidateProfileIds === undefined ? {} : { candidateProfileIds: Object.freeze([...candidateProfileIds]) },
  ) });
  const scope = Object.freeze({ workerURL: boundOperation.workerURL, accountScope: boundOperation.accountScope });
  return { boundOperation, scope, client:clientForService('staging'),
    journal:new VoiceProfileIntents(SecureStore, scope, randomUUID) };
}
type ConfirmedContext = NonNullable<ReturnType<typeof confirmedContext>>;

async function sendConfirmed(
  context: ConfirmedContext, uri: string, uploadSha256: string, consent: ConfirmedSelection,
  source: { result: ObservedVoiceResult } | { pendingSource: ConfirmedSourceProof; existingKey: string },
  signal?: AbortSignal,
) {
  const { boundOperation, scope, journal } = context;
  const localNamespace = await originalNamespace();
  signal?.throwIfAborted();
  const digest = (bytes: Uint8Array) => hex(sha256(bytes));
  return enrollConfirmedVoiceProfile({
    provenance: {
      stageEnabled: true, operation: boundOperation, localNamespace,
      original: { uri, size: boundOperation.sourceBytes, sha256: uploadSha256 },
      ...('result' in source
        ? { observed: { operationId: boundOperation.id, scope, sourceSha256: uploadSha256, result:source.result } }
        : { pendingSource: source.pendingSource }),
      confirmation: { operationId: boundOperation.id, segmentId: consent.segmentId, scope, participantConfirmed: true },
      hash: value => digest(new TextEncoder().encode(value)),
      readCurrentOriginal: clipSignal => readConfirmedOriginal(uri, boundOperation.sourceBytes, clipSignal),
      nativeClip: clipConfirmedRecording,
    },
    ...('existingKey' in source ? { existingKey: source.existingKey } : {}),
    displayName: consent.displayName,
    journalFor: () => journal,
    clientFor: (boundScope, clipper) => {
      if (boundScope.workerURL !== services.staging.workerURL)
        throw new Error('Confirmed voice clips are unavailable.');
      return new ProClient(services.staging.workerURL, services.staging.routerURL,
        (url, init) => fetch(url, init), SecureStore, uploadRecording, clipper);
    },
    digest, signal,
  });
}

/** Call from the owning Recorder, using the exact result from its staged job. */
export async function enrollConfirmedStageClip(
  operation: ProOperation,
  recording: File,
  exactObservedResult: ObservedVoiceResult,
  confirmation: ConfirmedSelection,
  signal?: AbortSignal,
) {
  const context = confirmedContext(operation);
  if (!context || confirmation.participantConfirmed !== true)
    throw new Error('Confirmed voice clips are unavailable.');
  const consent = Object.freeze({ ...confirmation });
  const uri = recording.uri;
  signal?.throwIfAborted();
  const uploadSha256 = await context.client.submittedDigestForVoiceObservation(context.boundOperation, exactObservedResult);
  if (!uploadSha256) throw new Error('Could not verify the completed recording and selected result.');
  return sendConfirmed(context, uri, uploadSha256, consent, {result:exactObservedResult}, signal);
}

async function pendingForContext(context: ConfirmedContext) {
  const { boundOperation, client, journal } = context;
  const sha = await client.readSubmittedOriginalDigest(boundOperation);
  if (!sha) return;
  const saved = (await journal.restore()).enrollment;
  const proof = saved?.confirmed;
  if (!proof || proof.operationId !== boundOperation.id || proof.sourceSha256 !== sha) return;
  return { proof, key:saved.mutationKey, sha };
}

/** Local metadata only. No reservation, result lookup, clip read, or network. */
export async function readPendingConfirmedStageClip(operation: ProOperation) {
  const context = confirmedContext(operation);
  const pending = context && await pendingForContext(context);
  if (!pending) return;
  const { segmentId, startMs, endMs, speakerId } = pending.proof;
  return { segmentId, startMs, endMs, speakerId };
}

/** Reconfirm the already-journaled slice; never create a new intent on this path. */
export async function resumeConfirmedStageClip(
  operation: ProOperation, recording: File, confirmation: ConfirmedSelection, signal?: AbortSignal,
) {
  const context = confirmedContext(operation);
  if (!context || confirmation.participantConfirmed !== true)
    throw new Error('Confirmed voice clips are unavailable.');
  const consent = Object.freeze({ ...confirmation });
  const uri = recording.uri;
  signal?.throwIfAborted();
  const pending = await pendingForContext(context);
  if (!pending || pending.proof.segmentId !== consent.segmentId)
    throw new Error('Could not verify the pending confirmed upload.');
  return sendConfirmed(context, uri, pending.sha, consent,
    { pendingSource:pending.proof, existingKey:pending.key }, signal);
}
