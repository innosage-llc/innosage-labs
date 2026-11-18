export type SpeakerResult = { requested: boolean; status: string; transcript?: string };
export type CompletedTranscript = { state: 'COMPLETED'; transcript: string; speakerLabeling?: SpeakerResult };

type CompletionFiles = {
  readOriginal(): Promise<string | undefined>;
  readSpeakers(): Promise<SpeakerResult | undefined>;
  writeOriginal(transcript: string): Promise<void>;
  writeSpeakers(speakerLabeling: SpeakerResult | undefined): Promise<void>;
};

const activeCompletions = new Map<string, Promise<CompletedTranscript>>();

/**
 * The first completed result owns the original and the matching speaker metadata.
 * Serialize concurrent callbacks, including across remounts, around the durable
 * original marker. A replay reads the committed result instead of writing it.
 */
export async function persistTranscriptCompletion(
  key: string,
  files: CompletionFiles,
  result: CompletedTranscript,
): Promise<CompletedTranscript> {
  const previous = activeCompletions.get(key);
  const work = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(async () => {
    const original = await files.readOriginal();
    if (original !== undefined) {
      return { state: 'COMPLETED' as const, transcript: original, speakerLabeling: await files.readSpeakers() };
    }
    await files.writeSpeakers(result.speakerLabeling);
    // Write the completion marker last; metadata can be repaired after a failed write.
    await files.writeOriginal(result.transcript);
    return result;
  });
  activeCompletions.set(key, work);
  try {
    return await work;
  } finally {
    if (activeCompletions.get(key) === work) activeCompletions.delete(key);
  }
}
