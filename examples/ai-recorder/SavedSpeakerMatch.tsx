import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { Directory, File } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { sha256 } from '@noble/hashes/sha2.js';
import { clientForOperation, hashRecording } from './ProAccess';
import type { ProOperation, VoiceSegment } from './ProClient';
import { uploadMatch } from './NativeUpload';
import { matchOnTap, type MatchSource } from './DeviceSpeakerMatch';
import { reviewLiveVoiceSegments, type VoiceReviewRow } from './VoiceProfileReview';
import { VoiceSpeakerReview } from './ui/voice-profile/voice-speaker-review';
import { ActionButton } from './ui/ActionButton';

const key = (op:ProOperation) => 'voiceprofile.match-source.' + op.id;
const active = new Map<string,Promise<void>>();
const sidecarFile = (audio:File) => new File(audio.parentDirectory, audio.name+'.match.sidecar');

const sourceFile = (audio:File) => new File(audio.parentDirectory, audio.name+'.match.source.json');

export function removeOrphanedMatchFiles(directory: Directory) {
  for (const entry of directory.list()) {
    if (!(entry instanceof File)) continue;
    const name = /^((?:Recording|Import)-[0-9]+-[a-f0-9-]{36}\.m4a)\.match\.(?:sidecar|source\.json)(?:\.pending)?$/.exec(entry.name);
    if (name && !(new File(directory,name[1])).exists) entry.delete();
  }
}

async function sourceFor(op:ProOperation,audio:File) {
  const metadata=sourceFile(audio);
  if (!audio.exists || !metadata.exists || metadata.size>4096 || !sidecarFile(audio).exists) return;
  const entry=JSON.parse(await metadata.text());
  if (entry.owner===op.accountScope && entry.uri===audio.uri && entry.operation===op.id)
    return entry.source as MatchSource;
}

export function saveMatchBeforeCleanup(op:ProOperation,audio:File,signal?:AbortSignal) {
  const id = key(op);
  const existing = active.get(id);
  if (existing) return existing;
  async function save() {
    const client = clientForOperation(op);
    if (!await sourceFor(op,audio)) {
      const evidence = await client.savedMatchEvidence(op,audio.name,signal);
      if (evidence) {
        const {bytes,...metadata} = evidence;
        const source:MatchSource = {...metadata,originalBytes:op.sourceBytes,sidecarBytes:bytes.length,
          sidecarSha256:Array.from(sha256(bytes),b => b.toString(16).padStart(2,'0')).join('')};
        const file = sidecarFile(audio);
        const temporary = new File(file.parentDirectory,file.name+'.pending');
        try {
          await temporary.write(bytes);
          await temporary.move(file,{overwrite:true});
          const marker=sourceFile(audio);
          const next=new File(marker.parentDirectory,marker.name+'.pending');
          try {
            await next.write(JSON.stringify({owner:op.accountScope,uri:audio.uri,operation:op.id,source}));
            await next.move(marker,{overwrite:true});
          } finally { if (next.exists && next.uri!==marker.uri) next.delete(); }
        } finally { if (temporary.exists && temporary.uri !== file.uri) temporary.delete(); }
      }
    }
    await client.cleanup(op,audio.name);
  }
  const work = save().finally(() => active.delete(id));
  active.set(id,work);
  return work;
}

export function SavedSpeakerMatch({operation:op,recording,originalUri}:{operation:ProOperation;recording:File;originalUri:string}) {
  const [ready,setReady] = useState(false);
  const [refresh,setRefresh] = useState(0);
  const [rows,setRows] = useState<VoiceReviewRow[]>();
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const controller = useRef<AbortController|null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(() => {
    function clear() {
      controller.current?.abort();
      clearTimeout(timer.current);
      setRows(undefined);
    }
    const sub = AppState.addEventListener('change', state => {if (state !== 'active') clear();});
    return () => {sub.remove(); clear();};
  },[op.id,originalUri]);
  useEffect(() => {
    const check=new AbortController();
    setReady(false);
    void (async()=>{
      let saved=await sourceFor(op,recording);
      if (!saved) {
        try { await saveMatchBeforeCleanup(op,recording,check.signal); }
        catch (error) { if (!await sourceFor(op,recording)) throw error; }
        saved=await sourceFor(op,recording);
      }
      if (!saved) return;
      const profiles=await clientForOperation(op).listVoiceProfiles(op,check.signal);
      if (!check.signal.aborted) setReady(profiles.some(p=>p.status==='active'));
    })().catch(()=>{ if(!check.signal.aborted) setMessage('Could not check match availability.'); });
    return ()=>check.abort();
  },[op.id,recording.uri,refresh]);
  async function match() {
    if (controller.current || AppState.currentState !== 'active') return;
    const local = new AbortController(); controller.current=local;
    const signal=local.signal;
    setBusy(true); setMessage(''); setRows(undefined);
    try {
      const source=await sourceFor(op,recording);
      if (!source || recording.size!==source.originalBytes) {
        setMessage('Matching is unavailable for this recording.'); return;
      }
      const client=clientForOperation(op);
      const profiles=await client.listVoiceProfiles(op,signal);
      if (!profiles.some(p=>p.status==='active')) {setMessage('No active voice profiles are available.');return;}
      if (await hashRecording(recording,signal)!==source.originalSha256)
        throw new Error('The saved recording has changed.');
      const intentKey='voiceprofile.match-tap.'+op.id;
      const reply=await matchOnTap({key:intentKey,source,store:SecureStore,uuid:randomUUID,
        control:(action,body)=>client.matchControl(op,action,body,signal),
        upload:(tap,cap)=>uploadMatch(tap,cap,recording.uri,source,signal)});
      signal.throwIfAborted();
      if (reply.state!=='completed' || !reply.decisions) {
        setMessage(reply.state==='failed'?'Matching failed. Tap again for a new attempt.':'Match pending. Tap again to check status.');
        return;
      }
      const file=sidecarFile(recording);
      if (file.size!==source.sidecarBytes) throw new Error();
      const bytes=await file.bytes();
      const digest=Array.from(sha256(bytes),b=>b.toString(16).padStart(2,'0')).join('');
      if (digest!==source.sidecarSha256) throw new Error();
      const sidecar=JSON.parse(new TextDecoder().decode(bytes));
      const segments:VoiceSegment[]=sidecar.segments.map((s:{start_ms:number;end_ms:number;text:string},i:number)=>{
        const speaker=sidecar.annotations[i].speaker;
        return {segmentId:'seg-'+(i+1),startMs:s.start_ms,endMs:s.end_ms,text:s.text,speakerId:speaker,
          ...(reply.decisions![speaker] ?? {disposition:'unknown'})};
      });
      signal.throwIfAborted();
      if (AppState.currentState === 'active') {
        // Resolve current display names, then recheck eligibility at their matched revision.
        if (await hashRecording(recording,signal)!==source.originalSha256) throw new Error('The saved recording has changed.');
        signal.throwIfAborted();
        const names=await client.listVoiceProfiles(op,signal);
        const intent=JSON.parse(await SecureStore.getItemAsync(intentKey) ?? 'null');
        if (!intent?.tap) return;
        const verified=await client.matchControl(op,'status',{tap:intent.tap},signal);
        signal.throwIfAborted();
        if (AppState.currentState !== 'active') return;
        const current=segments.map(s=>s.disposition==='matched' && verified.decisions?.[s.speakerId ?? '']?.matchedProfileId!==s.matchedProfileId
          ? {...s,disposition:'unknown' as const,matchedProfileId:undefined} : s);
        setRows(reviewLiveVoiceSegments(current,names));
        clearTimeout(timer.current);
        timer.current=setTimeout(()=>setRows(undefined),30_000);
        await SecureStore.deleteItemAsync(intentKey);
      }
    } catch {if (!signal.aborted) setMessage('Could not check the match. Your numbered transcript is available.');}
    finally {controller.current=null;setBusy(false);}
  }
  return <View>
    {ready ? <ActionButton title="Match speakers" disabled={busy} onPress={match}/> :
      message ? <ActionButton title="Check match availability" disabled={busy} onPress={()=>setRefresh(n=>n+1)}/> : null}
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
    <VoiceSpeakerReview originalUri={originalUri} operationId={op.id} rows={rows}
      correctionKey={'voiceprofile.corrections.'+recording.name+'.'+op.id}/>
  </View>;
}
