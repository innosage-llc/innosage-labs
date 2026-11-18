import { DraftSummary } from './DraftSummary';
import { TranscriptSummary } from './TranscriptSummary';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { RecorderSwitch } from './RecorderSwitch';
import { supportsProUpload } from './NativeUpload';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetch } from 'expo/fetch';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { AppHeader } from './ui/AppChrome';
import { ActionButton } from './ui/ActionButton';
import { canEditTranscript, canLeaveTranscript } from './ui/navigation';
import { useTheme } from './ui/theme';
import { draftEditorIsBundled, createDraftDocument } from './draftDocumentStore';
import { draftText } from './draftDocumentModel';
import { RecorderDraftHost } from './RecorderDraftHost';

import { clientForService, clientForOperation, selectedService, hashRecording } from './ProAccess';
import { openAIAccess } from './OpenAIAccess';
import { openAIMaxBytes } from './OpenAIClient';
import { services, serviceForWorker, type ServiceId } from './ServiceConfig';
import { ProServiceError, type ProOperation } from './ProClient';
import { readableSpeakerTranscript } from './speakerTranscript';
import { persistTranscriptCompletion, readCommittedTranscript, parseSpeakerResult, type CompletedTranscript, type SpeakerResult } from './transcriptCompletion';
import { connectGateway, type Gateway } from './GatewayConnection';
import { KnownServiceFailure, readOperationWithDeadline, statusRecoveryMessage } from './operationRecovery';
type Job = { state: string; transcript?: string; speakerLabeling?: SpeakerResult };
const stateLabels: Record<string, string> = {
  RESERVED: 'Ready to upload', UPLOADING: 'Uploading', STAGED: 'Preparing audio',
  QUEUED: 'Queued', PROCESSING: 'Transcribing', COMPLETED: 'Complete',
  FAILED: 'Transcription failed', CANCELLED: 'Cancelled', CLEANED: 'Expired', EXPIRED: 'Expired',
};
const pending = new Set(['UPLOADING', 'STAGED', 'QUEUED', 'PROCESSING']);
const terminal = new Set(['FAILED', 'CANCELLED', 'CLEANED', 'EXPIRED']);

async function saveText(file: File, text: string) {
  const temporary = new File(file.parentDirectory, file.name + '.pending');
  await temporary.write(text);
  await temporary.move(file, { overwrite: true });
}

export function Transcript({ recording, recordingTitle, onClose }: { recording: File; recordingTitle: string; onClose: () => void }) {
  const { palette, spacing, typography } = useTheme();
  const [connecting, setConnecting] = useState(true);
  const [gateway, setGateway] = useState<Gateway>();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [operation, setOperation] = useState<string>();
  const [paidOperation, setPaidOperation] = useState<ProOperation>();
  const [service, setService] = useState<ServiceId>('staging');
  const isOpenAI = service === 'openai';
  const proClient = isOpenAI ? undefined : clientForService(service);
  const [unsavedOpenAI, setUnsavedOpenAI] = useState<string>();
  const [openAIConfigured, setOpenAIConfigured] = useState(false);
  const [usePro, setUsePro] = useState(false);
  const [proAvailable, setProAvailable] = useState(false);
  const submission = useRef<AbortController | null>(null);
  const [identifySpeakers, setIdentifySpeakers] = useState(false);
  const [job, setJob] = useState<Job>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusUnknown, setStatusUnknown] = useState(false);
  const [summaryLocked, setSummaryLocked] = useState(false);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const seededRevision = useRef(false);
  const [revisionReadFailed, setRevisionReadFailed] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const hasDraftEditor = useMemo(draftEditorIsBundled, []);
  const [draftDocument, setDraftDocument] = useState<Awaited<ReturnType<typeof createDraftDocument>>>();
  const [editingDraft, setEditingDraft] = useState(false);
  const [draftRevision, setDraftRevision] = useState(0);
  const autoOpened = useRef(false);
  const recordingUri = recording.uri;
  useEffect(() => {
    if (!hasDraftEditor) return;
    let active = true;
    void createDraftDocument(new File(recordingUri), 'transcript').then(async document => {
      const latest = await document.recover();
      if (active) {
        setDraftRevision(latest?.revision ?? 0);
        setDraftDocument(document);
      }
    }).catch(() => { if (active) setMessage('Could not recover this recording’s Draft document.'); });
    return () => { active = false; };
  }, [hasDraftEditor, recordingUri]);
  const original = new File(recording.parentDirectory, recording.name + '.original.txt');
  const summaryFile = new File(recording.parentDirectory, recording.name + '.summary.json');
  const revision = new File(recording.parentDirectory, recording.name + '.revision.txt');
  const speakerFile = new File(recording.parentDirectory, recording.name + '.speakers.json');
  const operationKey = 'transcription.' + recording.name;
  const completionFiles = {
    readOriginal: async () => original.exists ? original.text() : undefined,
    readSpeakers: async () => {
      if (!speakerFile.exists) return;
      try { return parseSpeakerResult(JSON.parse(await speakerFile.text())); } catch { return; }
    },
    writeOriginal: (text: string) => saveText(original, text),
    writeSpeakers: async (speakers: SpeakerResult | undefined) => {
      if (speakers) await saveText(speakerFile, JSON.stringify(speakers));
      else if (speakerFile.exists) speakerFile.delete();
    },
  };
  const committedResult = () => readCommittedTranscript(original.uri, completionFiles);

  async function showCompletion(committed: CompletedTranscript) {
    if (!seededRevision.current) {
      try {
        const savedRevision = revision.exists ? await revision.text() : undefined;
        // Once editors can accept input, even a replay with a clean draft cannot reseed the view.
        if (!seededRevision.current) {
          seededRevision.current = true;
          setRevisionReadFailed(false);
          setDraft(savedRevision !== undefined && savedRevision !== committed.speakerLabeling?.transcript
            ? savedRevision : readableSpeakerTranscript(committed.transcript, committed.speakerLabeling?.transcript));
        }
      } catch {
        if (!seededRevision.current) {
          setRevisionReadFailed(true);
          setMessage('The original is saved. Reopen this recording to recover its saved revision before editing.');
        }
      }
    }
    // Reaching a durable local completion is sufficient to release the in-memory OpenAI retry lock.
    setUnsavedOpenAI(undefined);
    setJob(committed);
  }

  useEffect(() => {
    let active = true;
    async function restore() {
      const [savedOperation, committed] = await Promise.all([
        SecureStore.getItemAsync(operationKey), committedResult(),
      ]);
      // Persisted jobs take precedence over the new-job preference, including old Free UUIDs.
      const saved = savedOperation ? (savedOperation.startsWith('{') ? JSON.parse(savedOperation)
        : { id: savedOperation, identifySpeakers: false }) : undefined;
      const restoredService = saved ? (saved.lane === 'openai' ? 'openai' : saved.lane === 'pro' ? serviceForWorker(saved.workerURL) : 'staging')
        : await selectedService();
      const paid: ProOperation | undefined = saved?.lane === 'pro' ? saved : undefined;
      const profile = restoredService === 'openai' ? undefined : await clientForService(restoredService).profile();
      if (!active) return;
      if (saved) {
        setIdentifySpeakers(saved.identifySpeakers);
        setOperation(saved.id);
      }
      setService(restoredService);
      setPaidOperation(paid);
      setProAvailable(supportsProUpload && !!profile);
      setUsePro(!!paid || (supportsProUpload && !savedOperation && !!profile));
      if (committed) {
        await showCompletion(committed);
        if (active && paid) await clientForOperation(paid).cleanup(paid, recording.name).catch(() => { if (active) setMessage('Saved locally. Service cleanup will retry when reopened.'); });
        return;
      }
      if (restoredService === 'openai') {
        const configured = await openAIAccess.profile();
        if (active) setOpenAIConfigured(configured);
        return;
      }
      if (restoredService === 'production' || paid || (supportsProUpload && !savedOperation && profile)) return;
      if (process.env.EXPO_PUBLIC_RECORDER_GATEWAY_URL) {
        const config = await connectGateway();
        if (active) setGateway(config);
      } else {
        const saved = await SecureStore.getItemAsync('recorder.gateway');
        if (active && saved) setGateway(JSON.parse(saved));
      }
    }
    void restore().catch(error => {
      if (active) setMessage(error instanceof Error && error.message === 'The original transcript needs recovery. It has not been changed.'
        ? error.message : 'Could not connect. Retry when online.');
    })
      .finally(() => { if (active) setConnecting(false); });
    return () => { active = false; submission.current?.abort(); };
  }, [operationKey]);

  async function request(config: Gateway | undefined, id: string, upload: boolean, signal: AbortSignal | undefined, paid: ProOperation | undefined) {
    let result: Job;
    if (paid) {
      if (upload && !supportsProUpload) throw new Error('Pro uploads are unavailable on iOS.');
      const operationClient = clientForOperation(paid);
      result = upload
        ? await operationClient.upload(paid, recording.name, recording, () => hashRecording(recording, signal), signal)
        : await operationClient.read(paid, recording.name, signal);
    } else {
      if (!config) throw new Error('Connect to the transcription service.');
      const response = await fetch(`${config.url}/v1/jobs/${id}`, {
        method: upload ? 'PUT' : 'GET',
        headers: {
          Authorization: `Bearer ${config.token}`,
          ...(upload ? { 'Content-Type': 'audio/mp4', 'X-Identify-Speakers': String(identifySpeakers) } : {}),
        },
        body: upload ? recording : undefined,
        signal,
      });
      if (response.status === 422) {
        const failure = await response.json().catch(() => ({}));
        if (failure.detail?.code === 'SPEAKER_UNAVAILABLE') setJob({ state: 'FAILED' });
        throw new KnownServiceFailure(typeof failure.detail === 'string' ? failure.detail
          : failure.detail?.message ?? 'This recording could not be transcribed.');
      }
      if (response.status === 413) throw new KnownServiceFailure('This recording exceeds the Free upload limit.');
      if (!response.ok) throw new Error('Could not reach or complete the transcription. Check the connection and retry.');
      result = await response.json();
    }
    const local = await persistResult(result);
    if (paid && result.state === 'COMPLETED') {
      await clientForOperation(paid).cleanup(paid, recording.name).catch(() => setMessage('Saved locally. Service cleanup will retry when reopened.'));
    }
    return local;
  }

  async function persistResult(result: Job): Promise<Job> {
    // When a previous screen finished saving and cleaning up the same operation,
    // its local receipt takes precedence over a remote terminal status.
    const committed = result.state === 'COMPLETED'
      ? await persistTranscriptCompletion(original.uri, completionFiles, { state: 'COMPLETED', transcript: result.transcript, speakerLabeling: result.speakerLabeling })
      : terminal.has(result.state) ? await committedResult() : undefined;
    if (committed) {
      await showCompletion(committed);
      return committed;
    }
    setJob(current => current?.state === 'COMPLETED' ? current : result);
    return result;
  }

  const complete = job?.state === 'COMPLETED';
  useEffect(() => {
    if (complete && !busy && draftDocument && !revisionReadFailed && !autoOpened.current) {
      autoOpened.current = true;
      setEditingDraft(true);
    }
  }, [complete, busy, draftDocument, revisionReadFailed]);
  async function readCommittedRevision() {
    const snapshot = await draftDocument?.recover();
    if (snapshot) return draftText(snapshot);
    return revision.exists ? revision.text() : undefined;
  }
  useEffect(() => {
    if ((!gateway && !paidOperation) || !operation || busy || complete) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await request(gateway!, operation!, false, controller.signal, paidOperation);
        if (pending.has(result.state) && !controller.signal.aborted) timer = setTimeout(poll, 3000);
      } catch (error) {
        if (!controller.signal.aborted) {
          setStatusUnknown(true);
          setMessage(statusRecoveryMessage(error));
        }
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [gateway, operation, busy, complete, paidOperation]);


  async function connect() {
    if (service !== 'staging') return;
    setConnecting(true);
    try {
      if (process.env.EXPO_PUBLIC_RECORDER_GATEWAY_URL) {
        setGateway(await connectGateway());
        setMessage('');
        return;
      }
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search ||
          parsed.hash || !['/', '/recorder'].includes(parsed.pathname) || token.trim().length < 32) throw new Error();
      const config = { url: parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname), token: token.trim() };
      await SecureStore.setItemAsync('recorder.gateway', JSON.stringify(config));
      setGateway(config);
      setToken('');
      setMessage('');
    } catch {
      setMessage('Could not connect. Check the gateway details and network.');
    } finally {
      setConnecting(false);
    }
  }

  async function checkOperationStatus() {
    if (!operation || (!gateway && !paidOperation) || busy || submission.current) return;
    setBusy(true);
    setMessage('');
    const controller = new AbortController();
    submission.current = controller;
    try {
      const result = await readOperationWithDeadline(
        signal => request(gateway, operation, false, signal, paidOperation), controller.signal,
      );
      setStatusUnknown(false);
      setMessage(pending.has(result.state)
        ? 'The same operation is still in progress. This check did not upload your audio again.'
        : result.state === 'COMPLETED' ? 'Transcript recovered from the same operation.' : 'This operation has ended. Review its status before starting another transcription.');
    } catch (error) {
      setStatusUnknown(true);
      setMessage(statusRecoveryMessage(error));
    } finally {
      if (submission.current === controller) submission.current = null;
      setBusy(false);
    }
  }

  async function submit() {
    if ((!supportsProUpload && (usePro || service === 'production')) || connecting || submission.current || busy || (isOpenAI ? !openAIConfigured && !unsavedOpenAI : !gateway && !usePro)) return;
    setBusy(true);
    setMessage('');
    const controller = new AbortController();
    submission.current = controller;
    let openAIRequestStarted = false;
    let serviceRequestStarted = false;
    try {
      const alreadySaved = await committedResult();
      if (alreadySaved) {
        await showCompletion(alreadySaved);
        return;
      }
      if (isOpenAI) {
        if (recording.size <= 0 || recording.size >= openAIMaxBytes) {
          throw new Error('Choose a non-empty M4A recording smaller than 25 MB.');
        }
        const id = operation ?? randomUUID();
        await SecureStore.setItemAsync(operationKey, JSON.stringify({ id, identifySpeakers: false, lane: 'openai' }));
        setOperation(id);
        openAIRequestStarted = !unsavedOpenAI;
        const transcript = unsavedOpenAI ?? await openAIAccess.transcribe(recording, controller.signal);
        setUnsavedOpenAI(transcript);
        try {
          await persistResult({ state: 'COMPLETED', transcript });
        } catch {
          throw new Error('Transcription is ready. Retry saving before closing this screen.');
        }
        setUnsavedOpenAI(undefined);
        return;
      }
      const terminalJob = job && terminal.has(job.state);
      let paid = terminalJob ? undefined : paidOperation;
      if ((!operation || terminalJob) && usePro) {
        if (!supportsProUpload) throw new Error('Pro uploads are unavailable on iOS.');
        if (!proClient) throw new Error('Pro is not configured for this build.');
        const profile = await proClient.profile();
        if (!profile) throw new Error('Configure your InnoSage Pro API key first.');
        const accountScope = await proClient.identity(profile.key, controller.signal);
        controller.signal.throwIfAborted();
        paid = { lane: 'pro', id: `recorder-transcription-v2-${Math.floor(Date.now() / 1000) + 86400}-${randomUUID()}`,
          identifySpeakers, workerURL: proClient.workerURL, accountScope, sourceBytes: recording.size };
      }
      const id = paid?.id ?? (terminalJob ? randomUUID() : operation ?? randomUUID());
      await SecureStore.setItemAsync(operationKey, JSON.stringify(paid ?? { id, identifySpeakers, lane: 'free', service: 'staging' }));
      setPaidOperation(paid);
      setOperation(id);
      setJob({ state: 'RESERVED' });
      controller.signal.throwIfAborted();
      const timeout = paid ? undefined : setTimeout(() => controller.abort(), 60_000);
      try {
        serviceRequestStarted = true;
        await request(gateway, id, true, controller.signal, paid);
        setStatusUnknown(false);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const failure = error instanceof Error ? error.message : undefined;
      const openAIDefinitiveFailure = !!failure && /^(OpenAI rejected this API key\.|Check that your OpenAI project key|Check your OpenAI project quota|OpenAI rejected the recording size\.|Choose a non-empty M4A recording|Enter an OpenAI Platform API key\.)/.test(failure);
      const knownServiceFailure = error instanceof KnownServiceFailure || error instanceof ProServiceError || !!failure && /^(This recording exceeds the supported file size\.|This recording or speaker identification is unavailable\.|This source exceeds 512 MiB or has changed\.|This source exceeds the service limit\.)/.test(failure);
      if (isOpenAI) {
        setStatusUnknown(false);
        setMessage(openAIRequestStarted && !openAIDefinitiveFailure
          ? 'OpenAI transcription may have completed, but its status cannot be checked here. Confirm before retrying to avoid duplicate submission; the original audio remains on this device.'
          : failure ?? 'Could not save the transcript.');
      } else {
        const uncertainOperation = serviceRequestStarted && !knownServiceFailure;
        if (uncertainOperation) setStatusUnknown(true);
        else setStatusUnknown(false);
        setMessage(uncertainOperation
          ? 'Connection interrupted. Status is unknown. Check this same operation before retrying; your original audio remains on this device.'
          : failure ?? 'Could not submit the recording.');
      }
      if (error instanceof ProServiceError && error.code === 'speaker_unavailable') setJob({ state: 'FAILED' });
    } finally {
      if (submission.current === controller) submission.current = null;
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await saveText(revision, draft);
      setDirty(false);
      setMessage('Revision saved on this device.');
    } catch {
      setMessage('Could not save the revision.');
    } finally {
      setBusy(false);
    }
  }

  const canGoBack = canLeaveTranscript(busy, summaryLocked, !!unsavedOpenAI);
  function requestClose() {
    if (!canGoBack) return;
    if (dirty) {
      Alert.alert('Discard unsaved revision?', 'Your saved transcript will not change.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onClose },
      ]);
    } else onClose();
  }

  const canChooseSpeakers = !busy && (!operation || ['FAILED', 'CANCELLED', 'CLEANED', 'EXPIRED'].includes(job?.state ?? ''));
  const input = { color: palette.text, borderColor: palette.border, borderWidth: 1, padding: spacing.sm };
  return (
    <Modal onRequestClose={requestClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
        <AppHeader title="Transcript" onBack={requestClose} backLabel="Back to library" backDisabled={!canGoBack} />
        <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <Text style={{ color: palette.text }}>{recordingTitle}</Text>
          {!canGoBack ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted }}>Finish the current operation or save its result before leaving.</Text> : null}
          <View style={styles.serviceCard}>
            <Text style={{ color: palette.text, fontWeight: '600' }}>{services[service].label}</Text>
            <Text style={{ color: palette.muted }}>{isOpenAI
              ? 'Transcription sends this M4A recording directly to OpenAI Platform and uses your project quota.'
              : !supportsProUpload && (service === 'production' || usePro) ? 'Pro uploads are unavailable on iOS.'
              : service === 'production'
                ? 'Transcription uploads this M4A recording to InnoSage Production for speech recognition.'
                : usePro
                  ? 'Transcription uploads this M4A recording to InnoSage Staging Pro for speech recognition.'
                  : 'Transcription uploads this M4A recording through InnoSage Staging to Edge Speech for recognition.'}</Text>
            <Text style={{ color: palette.muted }}>{isOpenAI
              ? 'Limit: M4A under 25 MB.'
              : !supportsProUpload && (service === 'production' || usePro) ? 'For new transcriptions choose staging Free access or OpenAI direct.'
              : service === 'production' || usePro
                ? 'InnoSage Pro limit: up to 4 hours and 512 MiB.'
                : proAvailable
                  ? 'Free staging limit: up to 15 minutes and 50 MB. Staging Pro supports up to 4 hours and 512 MiB.'
                  : supportsProUpload ? 'Free staging limit: up to 15 minutes and 50 MB. Configure a staging Pro key for recordings up to 4 hours and 512 MiB.'
                    : 'Free staging limit: up to 15 minutes and 50 MB.'}</Text>
          </View>
          {!complete ? <Text style={{ color: palette.muted }}>{operation ? 'This job keeps its original service.' : 'Change the default in Transcription service, then reopen this recording.'}</Text> : null}
          {message ? <Text accessibilityLiveRegion="polite" style={{ color: palette.text }}>{message}</Text> : null}
          {complete ? (
            <>
              <Text accessibilityRole="header" style={{ color: palette.text, fontWeight: '600' }}>{showOriginal ? 'Original transcript' : 'Editable revision'}</Text>
              <Text style={{ color: palette.muted }}>{isOpenAI ? 'OpenAI' : 'Edge Speech'} · {showOriginal ? 'Saved locally; read-only' : dirty ? 'Unsaved changes' : draftRevision > 0 || revision.exists ? 'Saved locally' : 'Not saved yet'}</Text>
              {job?.speakerLabeling?.requested ? <Text style={{ color: palette.muted }}>
                {job.speakerLabeling.status === 'completed'
                  ? 'Speakers identified. Labels distinguish voices, not people’s names.'
                  : 'Speaker identification could not be completed. The transcript is available.'}
              </Text> : null}
              {showOriginal || !hasDraftEditor ? <TextInput
                accessibilityLabel="Transcript text" multiline editable={!hasDraftEditor && !revisionReadFailed && canEditTranscript(showOriginal, busy)}
                value={showOriginal ? job?.transcript : draft} onChangeText={value => { setDraft(value); setDirty(true); }}
                style={[input, { minHeight: 180, textAlignVertical: 'top' }]} /> : null}
              {!showOriginal && hasDraftEditor ? <ActionButton
                title="Open in Draft" variant="primary" disabled={busy || summaryLocked || !draftDocument || revisionReadFailed}
                onPress={() => setEditingDraft(true)} /> : null}
              <ActionButton title={showOriginal ? 'Show revision' : 'Show original'} disabled={busy} onPress={() => setShowOriginal(!showOriginal)} />
              {!showOriginal && !hasDraftEditor ? <ActionButton title="Save revision" variant="primary" disabled={busy || revisionReadFailed} onPress={save} /> : null}
              {hasDraftEditor ? <DraftSummary key={recordingUri} recordingUri={recordingUri} original={original}
                output={summaryFile} hasRevision={draftRevision > 0 || revision.exists} readRevision={readCommittedRevision}
                readRevisionWithId={async () => {
                  if (!draftDocument) throw new Error('The saved transcript is not ready.');
                  const saved = await draftDocument.recover();
                  return saved ? {text:draftText(saved), sourceRevision:saved.revision}
                    : {text:revision.exists ? await revision.text() : ''};
                }}
                save={saveText} onLockChange={setSummaryLocked} /> : <TranscriptSummary original={original} hasRevision={draftRevision > 0 || revision.exists}
                readRevision={readCommittedRevision} output={summaryFile} save={saveText} onLockChange={setSummaryLocked} />}
            </>
          ) : isOpenAI ? (
            <>
              <Text style={{ color: palette.muted }}>M4A under 25 MB. OpenAI transcription uses your project quota. If the connection drops during submission, this app cannot check OpenAI job status; retrying may submit the recording again.</Text>
              {busy || connecting ? <ActivityIndicator accessibilityLabel="Connecting to OpenAI" /> : (openAIConfigured || unsavedOpenAI) ? (
                <ActionButton title={unsavedOpenAI ? 'Retry save' : operation ? 'Retry transcription' : 'Transcribe'} variant="primary" onPress={submit} />
              ) : (
                <Text style={{ color: palette.text }}>Verify and save your OpenAI API key in Transcription service.</Text>
              )}
            </>
          ) : gateway || usePro ? (
            <>
              <Text style={{ color: palette.muted }}>{usePro ? 'InnoSage Pro · up to 4 hours · 512 MiB' : 'Free staging · up to 15 minutes · 50 MB'}</Text>
              {proAvailable ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: palette.text }}>Use InnoSage Pro</Text>
                <View style={{ minWidth: 60 }}>
                  <RecorderSwitch value={usePro} enabled={canChooseSpeakers && service === 'staging' && (supportsProUpload || usePro)} onCheckedChange={value => {
                    setUsePro(value);
                    if (!value && !gateway) void connect();
                  }} label="Use InnoSage Pro" />
                </View>
              </View> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: palette.text }}>Identify speakers</Text>
                <View style={{ minWidth: 60 }}>
                  <RecorderSwitch value={identifySpeakers} onCheckedChange={setIdentifySpeakers} enabled={canChooseSpeakers}
                    label="Identify speakers" />
                </View>
              </View>
              <Text style={{ color: palette.muted }}>Add speaker labels to this transcript. May take longer.</Text>
              {job ? <Text style={{ color: palette.text }}>{stateLabels[job.state] ?? job.state}</Text> : null}
              {busy ? <ActivityIndicator accessibilityLabel="Submitting recording" /> : null}
              {statusUnknown && operation ? <ActionButton title={busy ? 'Checking status…' : 'Check same operation'} variant="outlined" disabled={busy} onPress={checkOperationStatus} /> : null}
              {!supportsProUpload && usePro ? <Text style={{ color: palette.muted }}>Pro uploads are unavailable on iOS. Choose staging Free access or OpenAI direct. Existing Pro results can still be read.</Text> : null}
              <ActionButton title={job && ['FAILED', 'CANCELLED', 'CLEANED', 'EXPIRED'].includes(job.state) ? 'Start new transcription' : operation ? 'Retry or resume' : 'Transcribe'} variant="primary" disabled={busy || (!supportsProUpload && usePro)} onPress={submit} />
            </>
          ) : service === 'production' ? (
            <Text style={{ color: palette.text }}>{supportsProUpload
              ? 'Save and verify a production Pro key in Transcription service before starting. Free transcription is available on staging.'
              : 'Production Pro is unavailable on iOS. Choose staging Free access or OpenAI direct in Transcription service, then reopen this recording.'}</Text>
          ) : (
            <View style={{ gap: spacing.md }}>
              {process.env.EXPO_PUBLIC_RECORDER_GATEWAY_URL ? null : <>
              <TextInput accessibilityLabel="Gateway URL" placeholder="https://…" autoCapitalize="none" value={url} onChangeText={setUrl} style={input} />
              <TextInput accessibilityLabel="Pilot access token" placeholder="Pilot access token" secureTextEntry autoCapitalize="none" value={token} onChangeText={setToken} style={input} />
              </>}
              <ActionButton title={connecting ? "Connecting…" : "Connect"} variant="primary" disabled={connecting} onPress={connect} />
            </View>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {editingDraft && draftDocument ? <RecorderDraftHost document={draftDocument} title={recordingTitle}
        initial={draft} onClose={() => setEditingDraft(false)} onCommitted={snapshot => setDraftRevision(snapshot.revision)} /> : null}
    </Modal>
  );
}

const styles = {
  serviceCard: { padding: 16, gap: 8, backgroundColor: '#F3EDF7', borderRadius: 20 } as const,
};
