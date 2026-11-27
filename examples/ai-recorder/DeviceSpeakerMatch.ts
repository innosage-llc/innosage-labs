export type MatchSource = {
  recordingId: string; receipt: string; originalSha256: string; originalBytes: number;
  sidecarSha256: string; sidecarBytes: number;
};
type Store = {getItemAsync(key: string): Promise<string|null>; setItemAsync(key:string,value:string):Promise<void>};
const pending = new Map<string, Promise<unknown>>();
type Reply = {state: string; decisions?: Record<string,{disposition:'matched'|'needs_review';matchedProfileId?:string}>; uploadCapability?:string};

/** Called only by the Match speakers button. A resumed attempt checks status without sending media. */
export async function matchOnTap(input: {
  key:string; source:MatchSource; store:Store; uuid:()=>string;
  control:(action:'reserve'|'status'|'abandon', body:object)=>Promise<Reply>;
  upload:(tap:string,capability:string)=>Promise<void>;
}): Promise<Reply> {
  const existing = pending.get(input.key);
  if (existing) return existing as Promise<Reply>;
  async function recover(tap:string) {
    let result = await input.control('status',{tap});
    if (result.state === 'reserved') result = await input.control('abandon',{tap});
    if (result.state === 'failed') await input.store.setItemAsync(input.key,'null');
    return result;
  }
  async function run() {
    const raw = await input.store.getItemAsync(input.key);
    let current = raw ? JSON.parse(raw) : undefined;
    if (current && (typeof current.tap !== 'string' || !/^dm_[0-9]{10}_[a-f0-9]{32}$/.test(current.tap) ||
        typeof current.sent !== 'boolean')) throw new Error('Invalid match operation.');
    if (current && Number(current.tap.slice(3,13)) <= Date.now()/1000) current = undefined;
    if (current?.sent) return recover(current.tap);
    const tap = current?.tap ?? 'dm_'+(Math.floor(Date.now()/1000)+600)+'_'+input.uuid().replace(/-/g,'');
    await input.store.setItemAsync(input.key,JSON.stringify({tap,sent:false}));
    const grant = await input.control('reserve',{tap,source:input.source});
    // Make ambiguity durable before invoking the native transport. No automatic audio retry.
    await input.store.setItemAsync(input.key,JSON.stringify({tap,sent:true}));
    if (grant.state === 'reserved' && typeof grant.uploadCapability === 'string' &&
        /^[a-f0-9]{64}$/.test(grant.uploadCapability)) {
      try { await input.upload(tap,grant.uploadCapability); } catch { /* Recover only via metadata. */ }
    }
    return recover(tap);
  }
  const work = run();
  pending.set(input.key,work);
  try { return await work; } finally { pending.delete(input.key); }
}
