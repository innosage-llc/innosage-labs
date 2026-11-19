import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { createDraftDocument } from './draftDocumentStore';
import { resolveSummaryShareEnvironment, summaryPublication, summaryPublicationSlot, type SummaryShareEnvironment } from './summaryPublication';

export const recorderSummaryShareEnvironment = resolveSummaryShareEnvironment(
  process.env.EXPO_PUBLIC_RECORDER_DRAFT_SHARE_ENV
);

export function recorderSummaryPublication(
  document: Awaited<ReturnType<typeof createDraftDocument>>,
  environment: SummaryShareEnvironment,
) {
  const slot = summaryPublicationSlot(environment,document.pageId);
  return summaryPublication({
    environment,pageId:document.pageId, recover:document.recover, randomUUID, request:fetch,
    sha256Hex: value => digestStringAsync(CryptoDigestAlgorithm.SHA256,value),
    read:() => SecureStore.getItemAsync(slot), write:value => SecureStore.setItemAsync(slot,value),
  });
}
