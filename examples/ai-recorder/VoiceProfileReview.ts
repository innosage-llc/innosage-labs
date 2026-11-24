import type { VoiceProfileSummary, VoiceSegment } from './ProClient';

const speaker = /^SPEAKER_0[1-8]$/;
const segment = /^[A-Za-z0-9_-]{1,128}$/;
const op = /^[A-Za-z0-9_-]{1,128}$/;

export type VoiceSource = Pick<VoiceSegment, 'segmentId' | 'startMs' | 'endMs'> & { speakerId: string };
export type VoiceReviewRow = VoiceSource & {
  disposition: 'matched' | 'needs_review' | 'unknown';
  liveName?: string;
};
type Group = { source: VoiceSource; ids: Set<string>; review: boolean; unknown: boolean };

function exactSource(value: VoiceSource) {
  return speaker.test(value.speakerId) && segment.test(value.segmentId) &&
    Number.isSafeInteger(value.startMs) && Number.isSafeInteger(value.endMs) &&
    0 <= value.startMs && value.startMs < value.endMs;
}

/** Use trustworthy *current* same-account summaries, never persistent cached names. */
export function reviewLiveVoiceSegments(
  segments: readonly VoiceSegment[], verifiedActiveProfiles: readonly VoiceProfileSummary[],
): VoiceReviewRow[] {
  const groups = new Map<string, Group>();
  const active = new Map<string, string>();
  const duplicated = new Set<string>();
  for (const profile of verifiedActiveProfiles) {
    if (duplicated.has(profile.profileId)) continue;
    if (active.delete(profile.profileId)) duplicated.add(profile.profileId);
    else if (profile.status === 'active' && profile.displayName.trim() &&
        [...profile.displayName].length <= 100) active.set(profile.profileId, profile.displayName);
  }
  for (const row of segments) {
    if (!row.speakerId) continue; // An original anonymous-without-label row stays anonymous.
    const source = { speakerId: row.speakerId, segmentId: row.segmentId,
      startMs: row.startMs, endMs: row.endMs };
    if (!exactSource(source)) continue;
    const group = groups.get(source.speakerId) ?? { source, ids: new Set<string>(), review:false, unknown:false };
    if (row.disposition === 'needs_review') group.review = true;
    else if (row.disposition === 'matched' && row.matchedProfileId) group.ids.add(row.matchedProfileId);
    else group.unknown = true;
    groups.set(source.speakerId, group);
  }
  return [...groups.values()].map(({source, ids, review, unknown}) => {
    if (review || ids.size > 1 || (ids.size && unknown)) return { ...source, disposition:'needs_review' };
    const id = [...ids][0];
    const liveName = id ? active.get(id) : undefined;
    return liveName ? { ...source, disposition:'matched', liveName } : { ...source, disposition:'unknown' };
  });
}

type AnnotationStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, payload: string): Promise<void>;
};
type SavedCorrection = { source: VoiceSource; label: string };

function name(value: string) {
  const trimmed = value.trim();
  if (![...trimmed].length || [...trimmed].length > 100 || /[\u0000-\u001f\u007f]/u.test(trimmed))
    throw new Error('Enter a valid local speaker label.');
  return trimmed;
}

export async function readManualVoiceCorrections(
  store: AnnotationStore, key: string, binding: { operationId: string; originalSha256: string },
): Promise<readonly SavedCorrection[]> {
  if (!op.test(binding.operationId) || !/^[a-f0-9]{64}$/.test(binding.originalSha256))
    throw new Error('A corrected speaker must refer to the original.');
  const encoded = await store.getItemAsync(key);
  if (encoded === null) return [];
  if (encoded.length > 4096) throw new Error('Invalid local speaker annotations.');
  const data = JSON.parse(encoded);
  if (!data || Object.keys(data).length !== 3 || data.contract !== 'recorder-local-voice-corrections/v1' ||
      data.binding !== binding.operationId + ':' + binding.originalSha256 ||
      !Array.isArray(data.entries) || data.entries.length > 8)
    throw new Error('Invalid local speaker annotations.');
  const seen = new Set<string>();
  return data.entries.map((entry: SavedCorrection) => {
    if (!entry?.source || Object.keys(entry).length !== 2 || Object.keys(entry.source).length !== 4 ||
        !exactSource(entry.source) || seen.has(entry.source.speakerId) || name(entry.label) !== entry.label)
      throw new Error('Invalid local speaker annotations.');
    seen.add(entry.source.speakerId);
    return entry;
  });
}

export async function saveManualVoiceCorrection(
  store: AnnotationStore, key: string, binding: { operationId: string; originalSha256: string },
  verifiedRows: readonly VoiceReviewRow[], choice: { speakerId: string; label: string; confirmedLocalOnly: true },
) {
  if (choice.confirmedLocalOnly !== true) throw new Error('Confirm the local-only correction first.');
  const selected = verifiedRows.find(row => row.speakerId === choice.speakerId);
  if (!selected || !exactSource(selected)) throw new Error('This original speaker segment is unavailable.');
  const source = { speakerId: selected.speakerId, segmentId: selected.segmentId,
    startMs: selected.startMs, endMs: selected.endMs };
  const annotation = { source, label: name(choice.label) };
  const prior = await readManualVoiceCorrections(store, key, binding);
  const entries = [...prior.filter(row => row.source.speakerId !== source.speakerId), annotation];
  const content = JSON.stringify({ contract:'recorder-local-voice-corrections/v1',
    binding:binding.operationId + ':' + binding.originalSha256, entries });
  if (content.length > 4096) throw new Error('The local speaker annotation is too large.');
  await store.setItemAsync(key, content);
  return entries;
}
