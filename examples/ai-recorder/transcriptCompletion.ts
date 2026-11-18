export type SpeakerResult = { requested: boolean; status: string; transcript?: string };
export function parseSpeakerResult(value: unknown): SpeakerResult | undefined {
  if (!value || typeof value !== 'object') return;
  const { requested, status, transcript } = value as Partial<SpeakerResult>;
  if (typeof requested !== 'boolean' || typeof status !== 'string' ||
      (transcript !== undefined && typeof transcript !== 'string')) return;
  return { requested, status, ...(typeof transcript === 'string' ? { transcript } : {}) };
}

export type CompletedTranscript = { state: 'COMPLETED'; transcript: string; speakerLabeling?: SpeakerResult };

type ReadFiles = {
  readOriginal(): Promise<string | undefined>;
  readSpeakers(): Promise<SpeakerResult | undefined>;
};
type CompletionFiles = ReadFiles & {
  writeOriginal(transcript: string): Promise<void>;
  writeSpeakers(speakerLabeling: SpeakerResult | undefined): Promise<void>;
};

const activeCompletions = new Map<string, Promise<unknown>>();

function inCompletionLane<T>(key: string, action: () => Promise<T>) {
  const previous = activeCompletions.get(key) ?? Promise.resolve();
  const work = previous.then(action);
  const settled = work.catch(() => undefined);
  activeCompletions.set(key, settled);
  void settled.then(() => {
    if (activeCompletions.get(key) === settled) activeCompletions.delete(key);
  });
  return work;
}

function isTranscriptText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function readCommitted(files: ReadFiles): Promise<CompletedTranscript | undefined> {
  const original = await files.readOriginal();
  if (original === undefined) return;
  if (!isTranscriptText(original)) throw new Error('The original transcript needs recovery. It has not been changed.');
  return { state: 'COMPLETED', transcript: original, speakerLabeling: await files.readSpeakers() };
}

export function readCommittedTranscript(key: string, files: ReadFiles) {
  return inCompletionLane(key, () => readCommitted(files));
}

/**
 * The first completed result owns the original and the matching speaker metadata.
 * Serialize concurrent reads and callbacks, including across remounts, around
 * the durable original marker. A replay reads the committed result instead.
 */
export function persistTranscriptCompletion(
  key: string,
  files: CompletionFiles,
  result: { state: 'COMPLETED'; transcript: unknown; speakerLabeling?: unknown },
): Promise<CompletedTranscript> {
  return inCompletionLane(key, async () => {
    const saved = await readCommitted(files);
    if (saved) return saved;
    const transcript = result.transcript;
    if (!isTranscriptText(transcript)) throw new Error('The service completed without a transcript.');
    const speakerLabeling = parseSpeakerResult(result.speakerLabeling);
    await files.writeSpeakers(speakerLabeling);
    // Write the completion marker last; metadata can be repaired after a failed write.
    await files.writeOriginal(transcript);
    return { state: 'COMPLETED', transcript, ...(speakerLabeling ? { speakerLabeling } : {}) };
  });
}
