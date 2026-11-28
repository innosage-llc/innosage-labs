import { File } from './localFiles';
import { Platform } from 'react-native';
import * as SecureStore from './credentialStore';
import { createDraftDocument } from './draftDocumentStore';
import { draftText, editedSummaryCitations, readSummaryGeneration, type SummarySourceCitation } from './draftDocumentModel';
import { committedSummary } from './summaryDraftLifecycle';
import { readCommittedTranscript } from './transcriptCompletion';
import { readTranscriptSidecar } from './transcriptTransfer';

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
    if (Platform.OS === 'android') {
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

export async function readSavedTranscriptEdit(recording: File) {
  const document = Platform.OS === 'android' ? await createDraftDocument(recording, 'transcript') : undefined;
  const snapshot = await document?.recover();
  const text = snapshot
    ? draftText(snapshot)
    : await readTranscriptSidecar(new File(recording.parentDirectory, recording.name + '.revision.txt'));
  return { document, revisionNumber: snapshot?.revision ?? 0, text };
}

async function transcriptAction(recording: File): Promise<RecordingDocumentActions['transcript']> {
  const original = new File(recording.parentDirectory, recording.name + '.original.txt');
  try {
    const committed = await readCommittedTranscript(original.uri, {
      readOriginal: () => readTranscriptSidecar(original),
      readSpeakers: async () => undefined,
    });
    if (committed) return 'Open transcript';
  } catch {
    // The canonical edit can still be readable when the original cannot be read.
  }
  try {
    if ((await readSavedTranscriptEdit(recording)).text !== undefined) return 'Open transcript';
  } catch {
    return 'Transcript';
  }
  const operation = await SecureStore.getItemAsync('transcription.' + recording.name).catch(() => undefined);
  return operation ? 'Transcript' : 'Transcribe';
}

export async function readRecordingDocumentActions(recording: File): Promise<RecordingDocumentActions> {
  const [transcript, summary] = await Promise.all([
    transcriptAction(recording),
    readSavedRecordingSummary(recording).catch(() => undefined),
  ]);
  return { transcript, summary: !!summary };
}
