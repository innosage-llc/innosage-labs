import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { createDraftDocument } from './draftDocumentStore';
import { summaryPublication } from './summaryPublication';

export function recorderSummaryPublication(document: Awaited<ReturnType<typeof createDraftDocument>>) {
  const slot = 'recorder.summary.staging.' + document.pageId;
  return summaryPublication({
    pageId:document.pageId, recover:document.recover, randomUUID, request:fetch,
    sha256Hex: value => digestStringAsync(CryptoDigestAlgorithm.SHA256,value),
    read:() => SecureStore.getItemAsync(slot), write:value => SecureStore.setItemAsync(slot,value),
  });
}
