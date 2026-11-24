import { prepareConfirmedRecordingSpan, type ConfirmedRecordingSpan } from './VoiceProfileConfirmedSegment';
import { consumeConfirmedEnrollmentReceipt, type ProClient, type VoiceProfileClip, type VoiceProfileScope } from './ProClient';
import type { VoiceProfileIntents } from './VoiceProfileIntents';

type Provenance = Parameters<typeof prepareConfirmedRecordingSpan>[0];
type Clipper = (span: ConfirmedRecordingSpan, signal?: AbortSignal) => Promise<VoiceProfileClip>;
type Journal = Pick<VoiceProfileIntents, 'beginEnrollment' | 'finalizeEnrollment'>;
type Sender = Pick<ProClient, 'enrollVoiceProfile'>;

const sha256 = /^[a-f0-9]{64}$/;
const shape = ['source', 'recordingRef', 'segmentId', 'startMs', 'endMs'] as const;
const exactSpan = (a: ConfirmedRecordingSpan, b: ConfirmedRecordingSpan) =>
  !!a && Object.keys(a).length === shape.length &&
  shape.every(key => Object.hasOwn(a, key) && a[key] === b[key]);

/** The caller must supply the actual persisted upload SHA, exact observed result and a per-attempt Pro client. */
export async function enrollConfirmedVoiceProfile({
  provenance, displayName, journalFor, clientFor, digest, signal,
}: {
  provenance: Provenance;
  displayName: string;
  journalFor: (scope: VoiceProfileScope) => Journal;
  clientFor: (scope: VoiceProfileScope, clipper: Clipper) => Sender;
  digest: (bytes: Uint8Array) => string;
  signal?: AbortSignal;
}) {
  signal?.throwIfAborted();
  const name = displayName.trim();
  if (![...name].length || [...name].length > 100)
    throw new Error('Enter a profile name up to 100 characters.');
  const scope = Object.freeze({
    workerURL: provenance.operation.workerURL, accountScope: provenance.operation.accountScope,
  });
  const operationId = provenance.operation.id;
  const uploadSha256 = provenance.observed.sourceSha256;
  const prepared = await prepareConfirmedRecordingSpan(provenance);
  signal?.throwIfAborted();
  const clip = await prepared.clipper(prepared.span, signal);
  // Keep one privately owned snapshot. Uint8Array.slice() on a Buffer subclass
  // is allowed to alias, so copy through the typed-array constructor.
  const bytes = new Uint8Array(clip.bytes);
  const encode = (value: string) => new TextEncoder().encode(value);
  const rawDigest = digest(bytes);
  const nameDigest = digest(encode(name));
  if (!sha256.test(rawDigest) || !sha256.test(nameDigest))
    throw new Error('The confirmed upload could not be pinned.');
  const { span } = prepared;
  const clipDigest = digest(encode(JSON.stringify([
    'recorder-confirmed-enrollment/v1', rawDigest, uploadSha256, operationId, scope.workerURL,
    scope.accountScope, span.recordingRef, span.segmentId, span.startMs, span.endMs,
  ])));
  if (!sha256.test(clipDigest)) throw new Error('The confirmed upload could not be pinned.');
  signal?.throwIfAborted();

  const journal = journalFor(scope);
  const mutationKey = await journal.beginEnrollment({ clipDigest, nameDigest, mime: 'audio/wav' });
  let delivered = false;
  let closed = false;
  const clipper: Clipper = async (requested, clipSignal) => {
    signal?.throwIfAborted();
    clipSignal?.throwIfAborted();
    if (closed || delivered || !exactSpan(requested, span))
      throw new Error('The confirmed upload cannot use a different or repeated clip request.');
    delivered = true;
    return { bytes, mimeType: 'audio/wav' };
  };
  let client: Sender | undefined;
  try {
    signal?.throwIfAborted();
    client = clientFor(scope, clipper);
    const profile = await client.enrollVoiceProfile({
      ...scope, participantConfirmed: true, source: span, mutationKey,
    }, name, signal);
    if (!delivered || !consumeConfirmedEnrollmentReceipt(client, profile, scope, mutationKey, span, "accepted") ||
        !await journal.finalizeEnrollment(mutationKey))
      throw new Error('Could not verify the exact confirmed enrollment receipt.');
    return profile;
  } catch (error) {
    if (delivered && client &&
        consumeConfirmedEnrollmentReceipt(client, error, scope, mutationKey, span, "refused"))
      await journal.finalizeEnrollment(mutationKey);
    throw error;
  } finally {
    closed = true;
    bytes.fill(0);
  }
}
