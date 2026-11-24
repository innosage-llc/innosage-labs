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

const RECEIPT_CONTRACT = 'recorder-local-voice-receipt/v1';
const MAX_SEGMENTS = 100_000;

export type SafeVoiceReview = {
  matchedCount: number;
  reviewCount: number;
  unknownCount: number;
  reviewBySpeaker: ReadonlyMap<string, number>;
};

export type LocalVoiceReceipt =
  | { outcome: 'completed'; review: SafeVoiceReview }
  | { outcome: 'failed' };

type ReceiptStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
};

function receiptBinding(operation: ProOperation, originalUri: string) {
  if (!operation.voiceIdentification || !originalUri) throw new Error('Voice receipt requires the saved original.');
  return JSON.stringify([originalUri, operation.id, operation.workerURL, operation.accountScope, operation.sourceBytes]);
}

const label = /^(?:Speaker [1-8]|Unknown speaker)$/;
function validCounts(counts: number[]) {
  return counts.every(count => Number.isSafeInteger(count) && count >= 0)
    && counts.reduce((left, right) => left + right, 0) <= MAX_SEGMENTS;
}
function safeReview(matchedCount: number, reviewCount: number, unknownCount: number, pairs: unknown): SafeVoiceReview {
  if (!validCounts([matchedCount, reviewCount, unknownCount]) || !Array.isArray(pairs) || pairs.length > 9)
    throw new Error('Invalid voice receipt summary.');
  const reviewBySpeaker = new Map<string, number>();
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !label.test(pair[0])
      || !validCounts([pair[1]]) || pair[1] === 0 || reviewBySpeaker.has(pair[0]))
      throw new Error('Invalid voice receipt review.');
    reviewBySpeaker.set(pair[0], pair[1]);
  }
  if ([...reviewBySpeaker.values()].reduce((left, right) => left + right, 0) !== reviewCount)
    throw new Error('Invalid voice receipt review.');
  return { matchedCount, reviewCount, unknownCount, reviewBySpeaker };
}

export async function readLocalVoiceReceipt(store: ReceiptStore, key: string, operation: ProOperation, originalUri: string) {
  try {
    const raw = await store.getItemAsync(key);
    if (!raw || raw.length > 4096) return;
    const item = JSON.parse(raw);
    if (!item || item.contract !== RECEIPT_CONTRACT || item.binding !== receiptBinding(operation, originalUri)) return;
    if (item.outcome === 'failed' && Object.keys(item).length === 3)
      return { outcome: 'failed' } as const;
    if (item.outcome === 'completed' && Object.keys(item).length === 7) {
      return { outcome: 'completed' as const, review: safeReview(
        item.matchedCount, item.reviewCount, item.unknownCount, item.bySpeaker,
      ) };
    }
  } catch {
    return;
  }
}

export async function writeLocalVoiceReceipt(
  store: ReceiptStore, key: string, operation: ProOperation, originalUri: string, receipt: LocalVoiceReceipt,
) {
  const base = { contract: RECEIPT_CONTRACT, binding: receiptBinding(operation, originalUri), outcome: receipt.outcome };
  if (receipt.outcome === 'failed') return store.setItemAsync(key, JSON.stringify(base));
  const summary = safeReview(receipt.review.matchedCount, receipt.review.reviewCount, receipt.review.unknownCount,
    [...receipt.review.reviewBySpeaker.entries()]);
  await store.setItemAsync(key, JSON.stringify({
    ...base, matchedCount: summary.matchedCount, reviewCount: summary.reviewCount, unknownCount: summary.unknownCount,
    bySpeaker: [...summary.reviewBySpeaker.entries()],
  }));
}
