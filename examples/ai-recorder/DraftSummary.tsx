import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Share, Text, View } from 'react-native';
import { File } from './localFiles';
import { randomUUID } from 'expo-crypto';
import { draftText, editedSummaryCitations, type DraftSnapshot } from './draftDocumentModel';
import { createDraftDocument } from './draftDocumentStore';
import { openAIAccess } from './OpenAIAccess';
import { RecorderDraftHost } from './RecorderDraftHost';
import { recorderSummaryPublication, recorderSummaryShareEnvironment } from './recorderSummaryPublication';
import { generateSummaryCandidate, loadSummaryDocument, saveSummaryCandidate, type SummaryCandidate } from './summaryDraftLifecycle';
import { TranscriptSummary, type RecipeRequest, type SummaryProps } from './TranscriptSummary';
import { ActionButton } from './ui/ActionButton';
import { useTheme } from './ui/theme';
import { readLegacyRecordingSummary } from './savedRecordingDocuments';

type Document = Awaited<ReturnType<typeof createDraftDocument>>;
type ShareStatus = Awaited<ReturnType<ReturnType<typeof recorderSummaryPublication>['status']>>;
type Props = SummaryProps & {
  recordingUri:string;
  readRevisionWithId():Promise<{text:string; sourceRevision?:number}>;
};

export function DraftSummary(props:Props) {
  const { palette, spacing } = useTheme();
  const [document,setDocument] = useState<Document>();
  const [snapshot,setSnapshot] = useState<DraftSnapshot>();
  const [candidate,setCandidate] = useState<SummaryCandidate>();
  const [editing,setEditing] = useState(false);
  const [recipes,setRecipes] = useState(false);
  const [sharing,setSharing] = useState(false);
  const [owner,setOwner] = useState<ShareStatus>();
  const [ownerKnown,setOwnerKnown] = useState(false);
  const [otherOwner,setOtherOwner] = useState<ShareStatus>();
  const [otherError,setOtherError] = useState(false);
  const [retry,setRetry] = useState(0);
  const [loading,setLoading] = useState(true);
  const [formBusy,setFormBusy] = useState(false);
  const [busy,setBusy] = useState(false);
  const working = useRef(false);
  const [message,setMessage] = useState('');
  const outputUri = props.output.uri;
  const { recordingUri, onLockChange } = props;
  const target = recorderSummaryShareEnvironment;
  const otherTarget = target === 'production' ? 'staging' : 'production';
  const publication = useMemo(() => document && target ? recorderSummaryPublication(document,target) : undefined,[document,target]);
  const otherPublication = useMemo(() => document && target ? recorderSummaryPublication(document,otherTarget) : undefined,[document,target,otherTarget]);
  useEffect(() => { onLockChange(busy || formBusy || !!candidate || editing); },[busy,formBusy,candidate,editing,onLockChange]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      const doc = await createDraftDocument(new File(recordingUri),'summary');
      const saved = await loadSummaryDocument(doc, () => readLegacyRecordingSummary(new File(outputUri)));
      if (alive) { setDocument(doc); setSnapshot(saved); setMessage(''); }
    })().catch(() => { if (alive) setMessage('Could not read the saved summary. Your local files have not been replaced.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  },[recordingUri,outputUri,retry]);

  const locked = busy || formBusy;
  async function run(action:()=>Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setMessage('');
    try { await action(); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not complete the summary action.'); }
    finally { working.current = false; setBusy(false); }
  }
  async function accept(next:SummaryCandidate) {
    if (!document) return;
    const saved = await saveSummaryCandidate(document,next);
    setSnapshot(saved); setCandidate(undefined); setRecipes(false); setEditing(true); setMessage('');
  }
  async function generate(request:RecipeRequest,signal:AbortSignal) {
    if (!document || working.current || candidate) return;
    const {instructions,...meta} = request;
    const next = await generateSummaryCandidate({document,metadata:{...meta,id:randomUUID()},
      readInput:() => meta.source === 'revision' ? props.readRevisionWithId() : props.original.text().then(text=>({text})),
      generate:text=>openAIAccess.summarize(meta.model,text,{instructions,effort:meta.effort,webSearch:meta.webSearch},signal)});
    signal.throwIfAborted();
    setCandidate(next); setRecipes(false); setFormBusy(false); setMessage('');
    if (next.basedOnRevision === 0) {
      working.current = true; setBusy(true);
      try { await accept(next); }
      catch { setMessage('Generation finished. Retry saving this result without generating again.'); }
      finally { working.current = false; setBusy(false); }
    }
  }
  async function refreshOwner() {
    setOwnerKnown(false); setOwner(undefined);
    setOtherOwner(undefined); setOtherError(false);
    if (!publication) return;
    try { setOwner(await publication.status()); setOwnerKnown(true); }
    finally {
      // Only read the other slot locally. Another target must never be selected
      // automatically for a new publication, even during a version rollback.
      try { setOtherOwner(await otherPublication?.status()); }
      catch { setOtherError(true); }
    }
  }
  const text = useMemo(() => snapshot ? draftText(snapshot) : '',[snapshot]);
  const characters = useMemo(() => sharing ? Array.from(text) : [],[sharing,text]);
  const citations = useMemo(() => snapshot?.generation ? editedSummaryCitations(text,snapshot.generation) : [],[snapshot,text]);
  const secondary = {color:palette.muted};
  return <View style={{gap:spacing.sm}}>
    <Text accessibilityRole="header" style={{color:palette.text}}>Meeting summary</Text>
    {message ? <Text accessibilityLiveRegion="polite" style={{color:palette.text}}>{message}</Text> : null}
    {!document ? loading ? <Text style={secondary}>Checking for a saved summary…</Text> :
      <ActionButton title="Retry opening summary" onPress={()=>setRetry(n=>n+1)} /> : null}
    {document && !candidate && !recipes && !sharing ? <>
      {snapshot ? <>
        <ActionButton title="Open saved summary in Draft" variant="primary" disabled={locked} onPress={()=>setEditing(true)} />
        <Text style={secondary}>{snapshot.generation?.model} · {snapshot.generation?.source === 'revision' ? 'Saved revision' : 'Original transcript'} · Saved on this device</Text>
        <ActionButton title="Sources and sharing" disabled={locked} onPress={()=>void run(async()=>{setSharing(true); await refreshOwner();})} />
      </> : null}
      <ActionButton title={snapshot ? 'Generate another version' : 'Summarize'} variant={snapshot ? 'outlined' : 'primary'} disabled={locked} onPress={()=>{setRecipes(true);setMessage('');}} />
    </> : null}
    {recipes && !candidate ? <>
      <ActionButton title="Back to summary" variant="text" disabled={locked} onPress={()=>setRecipes(false)} />
      <TranscriptSummary {...props} onLockChange={setFormBusy} generateInDraft={generate} />
    </> : null}
    {candidate ? <>
      <Text accessibilityRole="header" style={{color:palette.text}}>{snapshot ? 'Review new version' : 'Generated summary'}</Text>
      <Text selectable style={{color:palette.text}}>{candidate.generation.text}</Text>
      <ActionButton title={snapshot ? 'Replace saved summary' : 'Save and open in Draft'} disabled={locked} onPress={()=>void run(()=>accept(candidate))} />
      <ActionButton title={snapshot ? 'Keep my saved summary' : 'Discard unsaved result'} variant="outlined" disabled={locked} onPress={()=>{setCandidate(undefined);setMessage('');}} />
    </> : null}
    {sharing && snapshot ? <>
      <ActionButton title="Back to summary" variant="text" disabled={locked} onPress={()=>{setSharing(false);setMessage('');}} />
      <Text accessibilityRole="header" style={{color:palette.text}}>Summary to share</Text>
      <Text selectable style={{color:palette.text}}>{text}</Text>
      {citations.map((citation,i) => {
        const quote = citation.start !== undefined && citation.end !== undefined ? characters.slice(citation.start,citation.end).join('') : '';
        return <Text key={i} accessibilityRole="link" onPress={()=>void run(()=>Linking.openURL(citation.url).then(()=>{}))}
          style={{color:palette.accent}}>{quote ? quote + ' · ' : 'Source · '}{citation.title || citation.url}</Text>;
      })}
      {!publication ? <Text style={secondary}>Public sharing is unavailable: this build has an invalid sharing target.</Text> : <>
        <Text style={secondary}>Only this saved summary and its sources will be public on Draft {target}. Local edits do not update the link automatically.</Text>
        {!ownerKnown ? <ActionButton title="Check saved link state" disabled={locked} onPress={()=>void run(refreshOwner)} /> : <>
          {owner?.url ? <>
            <Text selectable style={{color:palette.text}}>{owner.url}</Text>
            <ActionButton title="Share public link" disabled={locked} onPress={()=>void run(async()=>{if(owner.url) await Share.share({message:owner.url});})} />
          </> : null}
          {owner?.status !== 'unconfirmed' && owner?.status !== 'withdrawing' ?
            <ActionButton title={owner?.status === 'active' ? 'Update public summary' : 'Publish summary to ' + target} disabled={locked || !text.trim()}
              onPress={()=>void run(async()=>{try { await publication.publish(snapshot); } finally { await refreshOwner(); }})} /> :
            <Text style={secondary}>The last request was not confirmed. Withdraw this link before publishing again.</Text>}
          {owner && owner.status !== 'unpublished' ? <ActionButton title="Unpublish summary" disabled={locked} variant="outlined"
            onPress={()=>void run(async()=>{try { await publication.unpublish(); } finally { await refreshOwner(); }})} /> : null}
        </>}
        {otherError ? <Text style={secondary}>Could not read the existing {otherTarget} link state.</Text> : null}
        {otherPublication && otherOwner && otherOwner.status !== 'unpublished' ? <>
          <Text style={secondary}>An earlier Draft {otherTarget} link remains managed separately.</Text>
          {otherOwner.url ? <Text selectable style={{color:palette.text}}>{otherOwner.url}</Text> : null}
          <ActionButton title={'Withdraw existing ' + otherTarget + ' summary'} disabled={locked} variant="outlined"
            onPress={()=>void run(async()=>{try { await otherPublication.unpublish(); } finally { await refreshOwner(); }})} />
        </> : null}
      </>}
    </> : null}
    {editing && snapshot && document ? <RecorderDraftHost document={document} title="Meeting Summary"
      initial={text} onClose={()=>setEditing(false)} onCommitted={setSnapshot} /> : null}
  </View>;
}
