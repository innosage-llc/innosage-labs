import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { createDraftDocument, draftEditorIsBundled } from './draftDocumentStore';
import { editedSummaryCitations, readSummaryGeneration, type SummarySourceCitation } from './draftDocumentModel';
import { committedSummary } from './summaryDraftLifecycle';
import { readCommittedTranscript } from './transcriptCompletion';

export type RecordingDocumentDestination = 'transcript' | 'summary';

export type RecordingDocumentActions = {
  transcript: 'Transcribe' | 'Open transcript' | 'Transcript';
  summary: boolean;
};

export function savedSummaryFiles(output: File) {
  return output.parentDirectory.list()
    .filter((item): item is File => item instanceof File && item.name.startsWith(output.name + '.') && item.name.endsWith('.json'))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export async function readLegacyRecordingSummary(output: File) {
  let readError: unknown;
  for (const file of [...savedSummaryFiles(output), output]) {
    if (!file.exists) continue;
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!readSummaryGeneration(data, 'legacy')) throw new Error('Could not read the previous summary.');
      return { id: 'legacy', data };
    } catch (error) {
      readError = error;
    }
  }
  if (readError) throw readError;
}

export async function readSavedRecordingSummary(recording: File) {
  let draftError: unknown;
  try {
    if (draftEditorIsBundled()) {
      const committed = await committedSummary(await createDraftDocument(recording, 'summary'));
      const generation = committed?.snapshot.generation;
      if (committed && generation) return {
        ...generation,
        text: committed.text,
        citations: editedSummaryCitations(committed.text, generation)
          .filter((citation): citation is SummarySourceCitation => citation.end !== undefined),
      };
    }
  } catch (error) {
    draftError = error;
  }
  const output = new File(recording.parentDirectory, recording.name + '.summary.json');
  const legacy = await readLegacyRecordingSummary(output);
  if (legacy) return readSummaryGeneration(legacy.data, legacy.id);
  if (draftError) throw draftError;
}

export async function readRecordingDocumentActions(recording: File): Promise<RecordingDocumentActions> {
  const original = new File(recording.parentDirectory, recording.name + '.original.txt');
  const committed = await readCommittedTranscript(original.uri, {
    readOriginal: async () => original.exists ? original.text() : undefined,
    readSpeakers: async () => undefined,
  });
  if (!committed) {
    const operation = await SecureStore.getItemAsync('transcription.' + recording.name);
    return { transcript: operation ? 'Transcript' : 'Transcribe', summary: false };
  }

  // Opening recording detail only reads local state. Migration remains in the summary route.
  try {
    return { transcript: 'Open transcript', summary: !!await readSavedRecordingSummary(recording) };
  } catch {
    // A damaged summary must not hide the still-readable transcript.
    return { transcript: 'Open transcript', summary: false };
  }
}
