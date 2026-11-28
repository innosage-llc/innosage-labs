/** Private metadata only. A timeout is not a receipt; reconcile the same key. */
type Store = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
};
type Scope = { workerURL: string; accountScope: string };
export type ConfirmedSourceProof = {
  operationId: string; sourceSha256: string; segmentId: string; speakerId: string;
  startMs: number; endMs: number;
};
type Sample = { clipDigest: string; nameDigest: string; mime: 'audio/mp4' | 'audio/wav'; confirmed?: ConfirmedSourceProof };
type Enrollment = Sample & { mutationKey: string };
type Deletion = { profileId: string; mutationKey: string };
type Pending = { enrollment?: Enrollment; deletions: Deletion[] };
const digest = /^[a-f0-9]{64}$/;
const key = /^[A-Za-z0-9_-]{1,64}$/;
const profile = /^vp_[A-Za-z0-9_-]{16,64}$/;
const maxDeletions = 8;
const maxStorage = 2048;
const queue = new Map<string, Promise<unknown>>();
const invalid = () => new Error('Voice profile recovery metadata is invalid.');

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function has(record: Record<string, unknown>, keys: string[]) {
  return Object.keys(record).length === keys.length && keys.every(name => Object.hasOwn(record, name));
}
function match(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value);
}
export function parseConfirmedSourceProof(value: unknown): ConfirmedSourceProof {
  if (!object(value) || !has(value, ['operationId','sourceSha256','segmentId','speakerId','startMs','endMs']) ||
      !match(value.operationId, /^[A-Za-z0-9_-]{1,128}$/) ||
      !match(value.sourceSha256, digest) || !match(value.segmentId, /^[A-Za-z0-9_-]{1,128}$/) ||
      !match(value.speakerId, /^SPEAKER_0[1-8]$/) ||
      typeof value.startMs !== 'number' || typeof value.endMs !== 'number' ||
      !Number.isSafeInteger(value.startMs) || !Number.isSafeInteger(value.endMs) ||
      value.startMs < 0 || value.endMs > 4 * 60 * 60 * 1000 ||
      value.endMs - value.startMs < 2000 || value.endMs - value.startMs > 30_000) throw invalid();
  return { operationId:value.operationId, sourceSha256:value.sourceSha256, segmentId:value.segmentId,
    speakerId:value.speakerId, startMs:value.startMs, endMs:value.endMs };
}
function sample(value: Record<string, unknown>): Sample {
  if (!match(value.clipDigest, digest) || !match(value.nameDigest, digest)
      || (value.mime !== 'audio/mp4' && value.mime !== 'audio/wav')) throw invalid();
  const confirmed = Object.hasOwn(value, 'confirmed') ? parseConfirmedSourceProof(value.confirmed) : undefined;
  if (confirmed && value.mime !== 'audio/wav') throw invalid();
  return { clipDigest: value.clipDigest, nameDigest: value.nameDigest, mime: value.mime,
    ...(confirmed ? { confirmed } : {}) };
}

export class VoiceProfileIntents {
  private readonly storageKey: string;
  private readonly binding: string;
  constructor(private readonly store: Store, scope: Scope, private readonly makeKey: () => string) {
    const worker = new URL(scope.workerURL);
    if (worker.protocol !== 'https:' || worker.origin !== scope.workerURL
        || worker.port || !/^[a-z0-9.-]{1,253}$/.test(worker.hostname)
        || !match(scope.accountScope, digest)) throw invalid();
    this.storageKey = 'recorder.voice.intents.v1.' + scope.accountScope + '.' + worker.hostname;
    this.binding = scope.workerURL + '#' + scope.accountScope;
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const current = (queue.get(this.storageKey) ?? Promise.resolve()).then(operation);
    // Storage failures reject the caller but must not block future recovery.
    const settled = current.then(() => undefined, () => undefined);
    queue.set(this.storageKey, settled);
    void settled.then(() => {
      if (queue.get(this.storageKey) === settled) queue.delete(this.storageKey);
    });
    return current;
  }

  private async read(): Promise<Pending> {
    const raw = await this.store.getItemAsync(this.storageKey);
    if (raw === null) return { deletions: [] };
    if (raw.length > maxStorage) throw invalid();
    let record: unknown;
    try { record = JSON.parse(raw); } catch { throw invalid(); }
    if (!object(record) || !has(record, ['binding', 'enrollment', 'deletions'])
        || record.binding !== this.binding || !Array.isArray(record.deletions)
        || record.deletions.length > maxDeletions) throw invalid();
    const keys = new Set<string>();
    const profiles = new Set<string>();
    let enrollment: Enrollment | undefined;
    if (record.enrollment !== null) {
      const item = record.enrollment;
      if (!object(item) || !has(item, ['clipDigest', 'nameDigest', 'mime', 'mutationKey', ...(Object.hasOwn(item, 'confirmed') ? ['confirmed'] : [])])
          || !match(item.mutationKey, key)) throw invalid();
      enrollment = { ...sample(item), mutationKey: item.mutationKey };
      keys.add(item.mutationKey);
    }
    const deletions = record.deletions.map(item => {
      if (!object(item) || !has(item, ['profileId', 'mutationKey']) || !match(item.profileId, profile)
          || !match(item.mutationKey, key) || profiles.has(item.profileId)
          || keys.has(item.mutationKey)) throw invalid();
      profiles.add(item.profileId);
      keys.add(item.mutationKey);
      return { profileId: item.profileId, mutationKey: item.mutationKey };
    });
    return { ...(enrollment ? { enrollment } : {}), deletions };
  }

  private async write(value: Pending) {
    const raw = JSON.stringify({
      binding: this.binding, enrollment: value.enrollment ?? null, deletions: value.deletions,
    });
    if (raw.length > maxStorage) throw invalid();
    await this.store.setItemAsync(this.storageKey, raw);
  }

  private next(value: Pending) {
    const mutationKey = this.makeKey();
    if (!match(mutationKey, key) || mutationKey === value.enrollment?.mutationKey
        || value.deletions.some(entry => entry.mutationKey === mutationKey)) throw invalid();
    return mutationKey;
  }

  restore(): Promise<Pending> {
    return this.run(() => this.read());
  }

  beginEnrollment(input: Sample, existingKey?: string): Promise<string> {
    const request = sample(input);
    return this.run(async () => {
      const value = await this.read();
      const current = value.enrollment;
      if (existingKey !== undefined && current?.mutationKey !== existingKey)
        throw new Error('Could not verify the pending confirmed upload.');
      if (current) {
        if (JSON.stringify(current.confirmed) !== JSON.stringify(request.confirmed) || current.clipDigest !== request.clipDigest || current.nameDigest !== request.nameDigest
            || current.mime !== request.mime) {
          throw new Error('An earlier voice profile upload needs to be verified first.');
        }
        return current.mutationKey;
      }
      const mutationKey = this.next(value);
      await this.write({ ...value, enrollment: { ...request, mutationKey } });
      return mutationKey;
    });
  }

  finalizeEnrollment(mutationKey: string): Promise<boolean> {
    return this.run(async () => {
      const value = await this.read();
      if (value.enrollment?.mutationKey !== mutationKey || value.enrollment === undefined) return false;
      await this.write({ deletions: value.deletions });
      return true;
    });
  }

  beginDelete(profileId: string): Promise<string> {
    return this.run(async () => {
      if (!match(profileId, profile)) throw invalid();
      const value = await this.read();
      const current = value.deletions.find(item => item.profileId === profileId);
      if (current) return current.mutationKey;
      if (value.deletions.length >= maxDeletions) throw new Error('Check your pending profile deletions first.');
      const mutationKey = this.next(value);
      await this.write({ ...value, deletions: [...value.deletions, { profileId, mutationKey }] });
      return mutationKey;
    });
  }

  finalizeDelete(profileId: string, mutationKey: string): Promise<boolean> {
    return this.run(async () => {
      const value = await this.read();
      const exact = value.deletions.find(item => item.profileId === profileId && item.mutationKey === mutationKey);
      if (!exact) return false;
      await this.write({ ...value, deletions: value.deletions.filter(item => item !== exact) });
      return true;
    });
  }
}
