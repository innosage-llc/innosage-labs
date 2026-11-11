import type { SummaryOptions } from './OpenAIClient';
import { fetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import { listSummaryModels, openAIKey, summarizeOpenAI, transcribeOpenAI, verifyOpenAI } from './OpenAIClient';

const storageKey = 'recorder.openai.key';
const http = (url: string, init: RequestInit) => fetch(url, init);

async function requireKey() {
  const key = await SecureStore.getItemAsync(storageKey);
  if (!key) throw new Error('Save your OpenAI API key in Transcription service settings first.');
  return key;
}

export const openAIAccess = {
  async profile() {
    return !!(await SecureStore.getItemAsync(storageKey));
  },
  async configure(input: string) {
    const key = openAIKey(input);
    await verifyOpenAI(http, key);
    await SecureStore.setItemAsync(storageKey, key);
  },
  remove() {
    return SecureStore.deleteItemAsync(storageKey);
  },
  async summaryModels(signal: AbortSignal) {
    return listSummaryModels(http, await requireKey(), signal);
  },
  async summarize(model: string, transcript: string, options: SummaryOptions, signal: AbortSignal) {
    return summarizeOpenAI(http, await requireKey(), model, transcript, options, signal);
  },
  async transcribe(file: Blob, signal: AbortSignal) {
    return transcribeOpenAI(http, await requireKey(), file, signal);
  },
};
