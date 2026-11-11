import { fetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import { openAIKey, transcribeOpenAI, verifyOpenAI } from './OpenAIClient';

const storageKey = 'recorder.openai.key';
const http = (url: string, init: RequestInit) => fetch(url, init);

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
  async transcribe(file: Blob, signal: AbortSignal) {
    const key = await SecureStore.getItemAsync(storageKey);
    if (!key) throw new Error('Verify and save your OpenAI API key first.');
    return transcribeOpenAI(http, key, file, signal);
  },
};
