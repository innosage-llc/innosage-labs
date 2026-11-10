import { fetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';

export type Gateway = { url: string; token: string };
let pending: Promise<Gateway> | undefined;

async function restoreOrProvision(): Promise<Gateway> {
  const target = process.env.EXPO_PUBLIC_RECORDER_GATEWAY_URL?.replace(/\/$/, '');
  const previous = process.env.EXPO_PUBLIC_RECORDER_PREVIOUS_GATEWAY_URL?.replace(/\/$/, '');
  const saved = await SecureStore.getItemAsync('recorder.gateway');
  if (saved) {
    const config: Gateway = JSON.parse(saved);
    if (target && previous && config.url === previous) {
      config.url = target;
      await SecureStore.setItemAsync('recorder.gateway', JSON.stringify(config));
    }
    return config;
  }
  if (!target) throw new Error('Enter a gateway URL to connect.');
  const response = await fetch(target + '/v1/guests', { method: 'POST' });
  if (!response.ok) throw new Error('Connection unavailable');
  const guest = await response.json();
  if (typeof guest.token !== 'string' || guest.token.length < 32) throw new Error('Invalid credential');
  const config = { url: target, token: guest.token };
  await SecureStore.setItemAsync('recorder.gateway', JSON.stringify(config));
  return config;
}

export function connectGateway() {
  if (!pending) {
    pending = restoreOrProvision().finally(() => { pending = undefined; });
  }
  return pending;
}
