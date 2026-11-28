import { File } from './localFiles';
import { saveText } from './saveRecordingText';
import { readTranscriptSidecar } from './transcriptTransfer';
import { assertResultOwnerAvailable, releaseResultOwner, retainResultOwner } from './pendingResultOwner';

type Result = { id: string; text: string };
const memory = new Map<string, Result>();
const sidecar = (recording: File) => new File(recording.parentDirectory, recording.name + '.openai-success.json');

// Older operations also reached this store before requesting transcription.
// With no local result, both legacy and current attempts require fresh consent.
export function previousOpenAIDispatch(raw: string | null, expectedID?: string): string | undefined {
  if (!raw && !expectedID) return;
  const stored = raw && JSON.parse(raw);
  if (!stored || stored.lane !== 'openai' || stored.id !== expectedID || !expectedID) {
    throw new Error('The saved operation changed. Reopen this recording to check its status.');
  }
  const dispatch = stored.unresolvedDispatch ?? expectedID;
  if (typeof dispatch !== 'string' || !dispatch) throw new Error('Could not verify the previous OpenAI submission.');
  return dispatch;
}

export async function readPendingOpenAI(recording: File, id: string) {
  const file = sidecar(recording);
  let saved = memory.get(file.uri);
  if (!saved) {
    const raw = await readTranscriptSidecar(file);
    if (raw !== undefined) saved = JSON.parse(raw);
    else await assertResultOwnerAvailable(file.uri);
  }
  if (saved === undefined) return;
  if (saved?.id !== id || typeof saved.text !== 'string' || !saved.text.trim()) {
    throw new Error('The returned transcript needs local recovery. No new upload was sent.');
  }
  return saved.text;
}

export async function stagePendingOpenAI(recording: File, id: string, text: string) {
  const file = sidecar(recording);
  const result = { id, text };
  memory.set(file.uri, result);
  await retainResultOwner(file.uri);
  try {
    await saveText(file, JSON.stringify(result));
    memory.delete(file.uri);
    releaseResultOwner(file.uri);
  } catch {
    // Try the final commit as well. If that fails, this tab keeps the exact
    // result and save ownership until storage recovers. A peer cannot reupload.
  }
}

export async function clearPendingOpenAI(recording: File) {
  const file = sidecar(recording);
  memory.delete(file.uri);
  releaseResultOwner(file.uri);
  try { if (file.exists) await file.delete(); } catch { /* The committed original takes precedence. */ }
}
