import type { InnoSageServiceId } from './ServiceConfig';

export type Gateway = { url: string; token: string };
export type GatewayGuest = Gateway & { service: InnoSageServiceId; accountScope: string };
export type FreeOperation = {
  lane: 'free'; id: string; identifySpeakers: boolean;
  service: InnoSageServiceId; accountScope: string;
};
export type LegacyFreeOperation = Omit<FreeOperation, 'accountScope' | 'service'> & {
  service: 'staging'; accountScope?: undefined;
};

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const scope = /^[a-f0-9]{64}$/;
const bearer = /^[\x21-\x7e]{32,249}$/;
const legacyKey = 'recorder.gateway';

function readObject(value: string | null): Record<string, unknown> | undefined {
  if (!value) return;
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new Error('Could not recover the saved Free access.'); }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  throw new Error('Could not recover the saved Free access.');
}

/** Only the original UUID and Staging JSON formats may lack a bound identity. */
export function readFreeOperation(saved: unknown): FreeOperation | LegacyFreeOperation {
  const operation = typeof saved === 'string' ? { id: saved, identifySpeakers: false } : saved;
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error('Could not recover this transcription.');
  const { id, identifySpeakers, lane, service, accountScope } = operation as Record<string, unknown>;
  if (typeof id !== 'string' || !uuid.test(id) || typeof identifySpeakers !== 'boolean' || (lane !== undefined && lane !== 'free')) {
    throw new Error('Could not recover this transcription.');
  }
  if ((service === 'staging' || service === 'production') && lane === 'free' && typeof accountScope === 'string' && scope.test(accountScope)) {
    return { lane, id, identifySpeakers, service, accountScope };
  }
  if (accountScope === undefined && ((lane === undefined && service === undefined) || (lane === 'free' && service === 'staging'))) {
    return { lane: 'free', id, identifySpeakers, service: 'staging' };
  }
  throw new Error('Could not recover this transcription’s original service and identity.');
}

type Dependencies = {
  targets: Readonly<Partial<Record<InnoSageServiceId, string>>>;
  store: {
    getItemAsync(key: string): Promise<string | null>;
    setItemAsync(key: string, value: string): Promise<void>;
  };
  fingerprint(token: string): Promise<string>;
  provision(url: string): Promise<unknown>;
};

export function provisionedGuestToken(payload: unknown, expected: InnoSageServiceId) {
  if (!payload || typeof payload !== 'object') return;
  const { token, environment } = payload as Record<string, unknown>;
  // Older Staging Gateway deployments predate the response environment field.
  if (environment !== expected && !(expected === 'staging' && environment === undefined)) return;
  return token;
}

export function createGatewayGuests({ targets, store, fingerprint, provision }: Dependencies) {
  const pending = new Map<InnoSageServiceId, Promise<GatewayGuest>>();
  const key = (service: InnoSageServiceId) => `${legacyKey}.${service}`;

  function targetFor(service: InnoSageServiceId) {
    const url = targets[service];
    if (!url) throw new Error('Free transcription is unavailable for this environment in this build.');
    return url;
  }

  async function scopedGuest(service: InnoSageServiceId, url: string) {
    const saved = readObject(await store.getItemAsync(key(service)));
    if (!saved) return;
    if (saved.url !== url || saved.service !== service || typeof saved.token !== 'string' || !bearer.test(saved.token)) {
      throw new Error('The saved Free access belongs to a different service.');
    }
    const accountScope = await fingerprint(saved.token);
    if (saved.accountScope !== accountScope) throw new Error('Could not recover the saved Free access.');
    return { service, url, token: saved.token, accountScope };
  }

  async function legacyGuest(url: string) {
    const saved = readObject(await store.getItemAsync(legacyKey));
    if (typeof saved?.url !== 'string' || typeof saved.token !== 'string' || !bearer.test(saved.token)) return;
    if (saved.url.replace(/\/$/, '') !== url) return;
    return { service: 'staging' as const, url, token: saved.token, accountScope: await fingerprint(saved.token) };
  }

  async function connectNew(service: InnoSageServiceId): Promise<GatewayGuest> {
    const url = targetFor(service);
    const saved = await scopedGuest(service, url);
    if (saved) return saved;
    let guest: GatewayGuest | undefined = service === 'staging' ? await legacyGuest(url) : undefined;
    if (!guest) {
      const token = await provision(url);
      if (typeof token !== 'string' || !bearer.test(token)) throw new Error('Could not activate Free access. Try again.');
      guest = { service, url, token, accountScope: await fingerprint(token) };
    }
    await store.setItemAsync(key(service), JSON.stringify(guest));
    return guest;
  }

  function connect(service: InnoSageServiceId) {
    let access = pending.get(service);
    if (!access) {
      access = connectNew(service).finally(() => { pending.delete(service); });
      pending.set(service, access);
    }
    return access;
  }

  async function restore(operation: FreeOperation | LegacyFreeOperation): Promise<GatewayGuest> {
    const { service, accountScope } = operation;
    const url = targetFor(service);
    const saved = accountScope ? await scopedGuest(service, url) : undefined;
    if (saved && saved.accountScope === accountScope) return saved;
    // Keep the old key intact for older builds and for Staging jobs created before binding.
    const legacy = service === 'staging' ? await legacyGuest(url) : undefined;
    if (legacy && (!accountScope || legacy.accountScope === accountScope)) return legacy;
    throw new Error('Free access for this recording’s original operation is unavailable.');
  }

  return { connect, restore };
}

export function freeSizeLimit(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'This recording is empty or unavailable.';
  if (bytes > 50_000_000) return 'This recording is larger than the Free limit of 50 MB.';
}

export function freeRecordingLimit(bytes: number, durationMillis: number | undefined) {
  const sizeLimit = freeSizeLimit(bytes);
  if (sizeLimit) return sizeLimit;
  if (durationMillis === undefined || !Number.isFinite(durationMillis) || durationMillis <= 0) {
    return 'Could not verify the recording duration for Free transcription. Check that the recording plays, then retry.';
  }
  if (durationMillis > 15 * 60_000) {
    return 'This recording is longer than the Free limit of 15 minutes.';
  }
}
