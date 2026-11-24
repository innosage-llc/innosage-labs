import type { ProOperation, VoiceIdentification, VoiceProfileClip } from './ProClient';

import type { ConfirmedSourceProof } from './VoiceProfileIntents';

type ReadyResult = Extract<VoiceIdentification, { status: 'completed' | 'failed' }>;
type Scope = Readonly<{ workerURL: string; accountScope: string }>;
type Original = Readonly<{ uri: string; size: number; sha256: string }>;
export type ConfirmedRecordingSpan = Readonly<{
  source: 'confirmed_segment'; recordingRef: string; segmentId: string; startMs: number; endMs: number;
}>;
type Observed = Readonly<{
  operationId: string;
  scope: Scope;
  sourceSha256: string;
  result: ReadyResult;
}>;
type Confirmation = Readonly<{
  operationId: string;
  segmentId: string;
  scope: Scope;
  participantConfirmed: true;
}>;

const STAGE_WORKER = 'https://api-staging.draft.innosage.co';
const SHORT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SPEAKER = /^SPEAKER_0[1-8]$/;
const MAX_SOURCE = 512 * 1024 * 1024;
const MAX_WINDOW_END = 4 * 60 * 60 * 1000;
const MAX_WAV = 6 * 1024 * 1024;
const invalid = () => new Error('The confirmed segment could not be bound to its original recording.');

const shape = ['source', 'recordingRef', 'segmentId', 'startMs', 'endMs'] as const;
const sameScope = (a: Scope, b: Scope) =>
  a?.workerURL === STAGE_WORKER && a.workerURL === b?.workerURL &&
  DIGEST.test(a.accountScope) && a.accountScope === b.accountScope;
const originalValid = (original: Original) =>
  typeof original.uri === 'string' && original.uri.length <= 4096 && original.uri.startsWith('file:///') &&
  !/[?#\x00-\x20]/.test(original.uri) &&
  Number.isSafeInteger(original.size) && original.size > 0 && original.size <= MAX_SOURCE &&
  DIGEST.test(original.sha256);
const sameOriginal = (a: Original, b: Original) =>
  a.uri === b.uri && a.size === b.size && a.sha256 === b.sha256;
const exactSpan = (a: ConfirmedRecordingSpan, b: ConfirmedRecordingSpan) =>
  !!a && Object.keys(a).length === shape.length &&
  shape.every(key => Object.hasOwn(a, key) && a[key] === b[key]);

/** No filesystem, network, service activation, or account discovery. Use only from trusted Recorder controller. */
export async function prepareConfirmedRecordingSpan({
  stageEnabled, operation, original, observed, confirmation, localNamespace, hash, readCurrentOriginal, nativeClip, pendingSource,
}: {
  stageEnabled: boolean;
  operation: Readonly<ProOperation>;
  original: Original;
  observed?: Observed;
  pendingSource?: ConfirmedSourceProof;
  confirmation: Confirmation;
  /** Stable, private install-local 256-bit value. Never include this on the wire. */
  localNamespace: string;
  hash: (value: string) => Promise<string> | string;
  /** Trusted, owning Recorder reopens its original and independently verifies the original-source SHA. */
  readCurrentOriginal: (signal?: AbortSignal) => Promise<Original>;
  nativeClip: (original: Original, startMs: number, endMs: number, signal?: AbortSignal) => Promise<VoiceProfileClip>;
}) {
  if (stageEnabled !== true || operation.lane !== 'pro' || operation.identifySpeakers !== true ||
      operation.voiceIdentification === undefined || confirmation?.participantConfirmed !== true ||
      !SHORT_ID.test(operation.id) || !SHORT_ID.test(confirmation.segmentId) ||
      confirmation.operationId !== operation.id || !sameScope(operation, confirmation.scope) ||
      !DIGEST.test(localNamespace) || !originalValid(original) ||
      original.size !== operation.sourceBytes || !!observed === !!pendingSource ||
      (observed ? observed.operationId !== operation.id || !sameScope(operation, observed.scope) ||
        original.sha256 !== observed.sourceSha256
        : pendingSource?.operationId !== operation.id || pendingSource.segmentId !== confirmation.segmentId ||
          original.sha256 !== pendingSource.sourceSha256))
    throw invalid();
  const result = observed?.result;
  if (observed && (result?.contract !== 'recorder-voice-profile/v1' ||
      !['completed', 'failed'].includes(result.status) || !Array.isArray(result.segments) ||
      result.segments.length > 100_000)) throw invalid();
  const selectedRows = pendingSource ? [pendingSource] : result!.segments.filter(row => row?.segmentId === confirmation.segmentId);
  if (selectedRows.length !== 1) throw invalid();
  const { segmentId, startMs, endMs, speakerId } = selectedRows[0]!;
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < 0 ||
      endMs > MAX_WINDOW_END || endMs - startMs < 2000 || endMs - startMs > 30_000 ||
      typeof speakerId !== 'string' || !SPEAKER.test(speakerId) ||
      result?.segments.some(row => row !== selectedRows[0] && row.startMs < endMs &&
        row.endMs > startMs && row.endMs > row.startMs && row.speakerId !== speakerId))
    throw invalid();
  const proof = Object.freeze({ operationId: operation.id, sourceSha256: original.sha256,
    segmentId, startMs, endMs, speakerId });

  // Snapshot before async work; never retain reference to a mutable result or caller file object.
  const owner = Object.freeze({ ...original });
  const digest = await hash(JSON.stringify([
    'recorder-confirmed-segment/v1', localNamespace, operation.workerURL, operation.accountScope, owner.sha256,
  ]));
  if (typeof digest !== 'string' || !DIGEST.test(digest)) throw invalid();
  const span = Object.freeze({
    source: 'confirmed_segment' as const, recordingRef: 'rec_' + digest, segmentId, startMs, endMs,
  });
  let used = false;
  return Object.freeze({
    span, proof,
    async clipper(requested: ConfirmedRecordingSpan, signal?: AbortSignal): Promise<VoiceProfileClip> {
      signal?.throwIfAborted();
      if (used || !exactSpan(requested, span)) throw invalid();
      used = true;
      const liveOriginal = await readCurrentOriginal(signal);
      signal?.throwIfAborted();
      if (!originalValid(liveOriginal) || !sameOriginal(owner, liveOriginal)) throw invalid();
      const clip = await nativeClip({ uri: owner.uri, size: owner.size, sha256: owner.sha256 }, span.startMs, span.endMs, signal);
      signal?.throwIfAborted();
      const bytes = clip?.bytes;
      if (clip?.mimeType !== 'audio/wav' || !(bytes instanceof Uint8Array) ||
          bytes.byteLength <= 44 || bytes.byteLength > MAX_WAV) throw invalid();
      // The Android clipper emits this exact header and half-open frame count.
      // Reject stale/corrupt/unsupported native output rather than transmitting it.
      const ascii = (first: number, end: number) => String.fromCharCode(...bytes.subarray(first, end));
      const wav = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const rate = wav.getUint32(24, true);
      const channels = wav.getUint16(22, true);
      const frameSize = channels * 2;
      const sampleBytes = (Math.ceil(span.endMs * rate / 1000) - Math.ceil(span.startMs * rate / 1000)) * frameSize;
      if (ascii(0, 4) !== 'RIFF' || ascii(8, 16) !== 'WAVEfmt ' || ascii(36, 40) !== 'data' ||
          wav.getUint32(4, true) !== bytes.byteLength - 8 || wav.getUint32(16, true) !== 16 ||
          wav.getUint16(20, true) !== 1 || (channels !== 1 && channels !== 2) ||
          ![16000, 22050, 24000, 32000, 44100, 48000].includes(rate) ||
          wav.getUint32(28, true) !== rate * frameSize || wav.getUint16(32, true) !== frameSize ||
          wav.getUint16(34, true) !== 16 || wav.getUint32(40, true) !== sampleBytes ||
          bytes.byteLength !== 44 + sampleBytes) throw invalid();
      return { bytes, mimeType: 'audio/wav' };
    },
  });
}
