import type { ProClient, ProOperation, VoiceIdentification } from './ProClient';
import type { ServiceId } from './ServiceConfig';

const STAGE_FLAG = process.env.EXPO_PUBLIC_RECORDER_VOICE_PROFILES;
const MAX_LOOKUP_MS = 90 * 1000;

export function voiceProfileStageEnabled(service: ServiceId, flag = STAGE_FLAG) {
  return service === 'staging' && flag === 'true';
}

type Reader = Pick<ProClient, 'readVoiceIdentification'>;
export type VoiceFlowState =
  | { status: 'pending' }
  | { status: 'unavailable' }
  | { status: 'ready'; result: Exclude<VoiceIdentification, { status: 'pending' }> };

function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason ?? new Error('Voice matching cancelled.'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

export async function finishVoiceAfterSavingOriginal({
  client, operation, recording, originalSaved, signal,
  clock = Date.now, delay = abortableDelay,
}: {
  client: Reader;
  operation: ProOperation;
  recording: string;
  originalSaved: boolean;
  signal: AbortSignal;
  clock?: () => number;
  delay?: (ms: number, signal: AbortSignal) => Promise<void>;
}): Promise<VoiceFlowState> {
  if (!originalSaved || !operation.voiceIdentification || signal.aborted) {
    return { status: 'unavailable' };
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  const finishBy = clock() + MAX_LOOKUP_MS;
  const timer = setTimeout(onAbort, MAX_LOOKUP_MS);
  try {
    while (!controller.signal.aborted && clock() < finishBy) {
      const observed = await client.readVoiceIdentification(operation, recording, controller.signal);
      if (!observed || controller.signal.aborted) return { status: 'unavailable' };
      if (observed.result.status !== 'pending') return { status: 'ready', result: observed.result };
      await delay(Math.min(2000, Math.max(0, finishBy - clock())), controller.signal);
    }
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}
