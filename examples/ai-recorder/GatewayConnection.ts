import { fetch } from 'expo/fetch';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createGatewayGuests, type FreeOperation, type GatewayGuest } from './GatewayGuest';
import type { File } from 'expo-file-system';
import { KnownServiceFailure } from './operationRecovery';
import type { SpeakerResult } from './transcriptCompletion';
import type { InnoSageServiceId } from './ServiceConfig';
import allowedTargets from './recorder-free-targets.json';

const stagingInput = process.env.EXPO_PUBLIC_RECORDER_GATEWAY_URL?.replace(/\/$/, '');
const targets: Partial<Record<InnoSageServiceId, string>> = stagingInput === allowedTargets.staging
  ? { staging: allowedTargets.staging } : {};

export const gatewayAvailable = (service: InnoSageServiceId) => !!targets[service];

const guests = createGatewayGuests({
  targets,
  store: SecureStore,
  fingerprint: token => digestStringAsync(CryptoDigestAlgorithm.SHA256, token),
  provision: async url => {
    try {
      const response = await fetch(`${url}/v1/guests`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return (await response.json()).token;
    } catch { /* Keep transport details private. */ }
    throw new KnownServiceFailure('Could not activate Free access. Check your connection and retry.');
  },
});

export const connectGateway = guests.connect;
export const restoreGateway = guests.restore;

type GuestJob = { state: string; transcript?: string; speakerLabeling?: SpeakerResult };

export async function requestGuestJob(
  guest: GatewayGuest, operation: FreeOperation, upload: File | undefined, signal?: AbortSignal,
): Promise<GuestJob> {
  if (operation.service !== guest.service || operation.accountScope !== guest.accountScope ||
      targets[guest.service] !== guest.url) {
    throw new KnownServiceFailure('Free access for this recording’s original operation is unavailable.');
  }
  const response = await fetch(`${guest.url}/v1/jobs/${operation.id}`, {
    method: upload ? 'PUT' : 'GET',
    headers: {
      Authorization: `Bearer ${guest.token}`,
      ...(upload ? { 'Content-Type': 'audio/mp4', 'X-Identify-Speakers': String(operation.identifySpeakers) } : {}),
    },
    body: upload,
    redirect: 'error',
    signal,
  });
  if (response.status === 401 || response.status === 403) {
    throw new KnownServiceFailure('This environment could not verify your saved Free access. Retry with the same recording.');
  }
  if (response.status === 413) throw new KnownServiceFailure('This recording is larger than the Free limit of 50 MB.');
  if (response.status === 422) {
    const failure = await response.json().catch(() => ({}));
    if (failure.detail?.code === 'SPEAKER_UNAVAILABLE') {
      throw new GuestSpeakerUnavailable('Speaker identification is unavailable. You can turn it off and start a new transcription.');
    }
    throw new KnownServiceFailure('The service could not use this audio. Choose an M4A within the 15-minute Free limit.');
  }
  if (!response.ok) throw new Error('Free transcription is temporarily unavailable. Check your connection and retry.');
  return response.json();
}

export class GuestSpeakerUnavailable extends KnownServiceFailure {}
