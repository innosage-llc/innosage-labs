import { DraftSummary } from './DraftSummary';
import { TranscriptSummary } from './TranscriptSummary';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { recordingDurationMillis, supportsProUpload } from './NativeUpload';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { AppHeader } from './ui/AppChrome';
import { ActionButton } from './ui/ActionButton';
import { canEditTranscript, canLeaveTranscript } from './ui/navigation';
import { useTheme } from './ui/theme';
import { RecorderSwitch } from './RecorderSwitch';
import { draftEditorIsBundled, createDraftDocument } from './draftDocumentStore';
import { draftText, transcriptSeed } from './draftDocumentModel';
import { RecorderDraftHost } from './RecorderDraftHost';

import { clientForService, clientForOperation, selectedService, hashRecording } from './ProAccess';
import { openAIAccess } from './OpenAIAccess';
import { openAIMaxBytes } from './OpenAIClient';
import { services, serviceForWorker, type ServiceId } from './ServiceConfig';
import { ProServiceError, type ProOperation } from './ProClient';
import { readableSpeakerTranscript } from './speakerTranscript';
import { persistTranscriptCompletion, readCommittedTranscript, parseSpeakerResult, type CompletedTranscript, type SpeakerResult } from './transcriptCompletion';
import { connectGateway, gatewayAvailable, GuestSpeakerUnavailable, requestGuestJob, restoreGateway } from './GatewayConnection';
import { freeRecordingLimit, readFreeOperation, type FreeOperation, type LegacyFreeOperation } from './GatewayGuest';
import { InnoSageTranscriptAction } from './ui/InnoSageTranscriptAction';
import { KnownServiceFailure, readOperationWithDeadline, statusRecoveryMessage } from './operationRecovery';
import { finishVoiceAfterSavingOriginal, voiceProfileStageEnabled } from './VoiceProfileFlow';
import { summarizeVoiceProfileResult, VoiceProfileStatus, type VoiceProfileReview } from './ui/voice-profile/voice-profile-status';
type Job = { state: string; transcript?: string; speakerLabeling?: SpeakerResult };
type StoredProOperation = ProOperation & { authorizationDeniedBeforeUpload?: true };
const stateLabels: Record<string, string> = {
  RESERVED: 'Ready to upload', UPLOADING: 'Uploading', STAGED: 'Preparing audio',
  QUEUED: 'Queued', PROCESSING: 'Transcribing', COMPLETED: 'Complete',
  FAILED: 'Transcription failed', CANCELLED: 'Cancelled', CLEANED: 'Expired', EXPIRED: 'Expired',
};
const pending = new Set(['UPLOADING', 'STAGED', 'QUEUED', 'PROCESSING']);
const terminal = new Set(['FAILED', 'CANCELLED', 'CLEANED', 'EXPIRED']);
const speakerUnavailable = (error: unknown) => error instanceof GuestSpeakerUnavailable ||
  (error instanceof ProServiceError && error.code === 'speaker_unavailable');

async function saveText(file: File, text: string) {
  const temporary = new File(file.parentDirectory, file.name + '.pending');
  await temporary.write(text);
  await temporary.move(file, { overwrite: true });
}

export function Transcript({ recording, recordingTitle, backLabel = 'Back to library', onClose }: {
  recording: File; recordingTitle: string; backLabel?: string; onClose: () => void;
}) {
  const { palette, spacing, typography } = useTheme();
  const [connecting, setConnecting] = useState(true);
  const [freeOperation, setFreeOperation] = useState<FreeOperation | LegacyFreeOperation>();
  const [operation, setOperation] = useState<string>();
  const [paidOperation, setPaidOperation] = useState<ProOperation>();
  const [service, setService] = useState<ServiceId>('staging');
  const [serviceReady, setServiceReady] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const isOpenAI = service === 'openai';
  const proClient = isOpenAI ? undefined : clientForService(service);
  const [unsavedOpenAI, setUnsavedOpenAI] = useState<string>();
  const [openAIConfigured, setOpenAIConfigured] = useState(false);
  const [usePro, setUsePro] = useState(false);
  const [proAvailable, setProAvailable] = useState(false);
  const [proDenied, setProDenied] = useState(false);
  const submission = useRef<AbortController | null>(null);
  const [identifySpeakers, setIdentifySpeakers] = useState(false);
  const [matchVoiceProfiles, setMatchVoiceProfiles] = useState(false);
  const [voiceProfileResult, setVoiceProfileResult] = useState<{
    operation: ProOperation; review?: VoiceProfileReview; expanded?: boolean;
  }>();
  const [job, setJob] = useState<Job>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusUnknown, setStatusUnknown] = useState(false);
  const [summaryLocked, setSummaryLocked] = useState(false);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const seededRevision = useRef(false);
  const [revisionReadFailed, setRevisionReadFailed] = useState(false);
  const [showOriginal, setShowOriginal] = useState<boolean>();
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
        const savedRevision = await transcriptSeed(
          async () => hasDraftEditor ? (await createDraftDocument(new File(recordingUri),'transcript')).recover() : undefined,
          async () => revision.exists ? revision.text() : undefined,
        );
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
    async function readSavedOperation() {
      const savedOperation = await SecureStore.getItemAsync(operationKey);
      // Persisted jobs take precedence over the new-job preference, including old Free UUIDs.
      const saved = savedOperation?.startsWith('{') ? JSON.parse(savedOperation) : savedOperation;
      const paid: StoredProOperation | undefined = saved?.lane === 'pro' ? saved : undefined;
      const free = saved && saved.lane !== 'openai' && !paid ? readFreeOperation(saved) : undefined;
      const restoredService: ServiceId = paid ? serviceForWorker(paid.workerURL) : free ? free.service
        : saved?.lane === 'openai' ? 'openai' : await selectedService();
      return { saved, paid, free, restoredService };
    }
    async function restore() {
      const committed = await committedResult();
      const { saved, paid, free, restoredService } = await readSavedOperation().catch(async error => {
        if (committed && active) await showCompletion(committed);
        throw error;
      });
      if (!active) return;
      if (saved) {
        setIdentifySpeakers(free?.identifySpeakers ?? saved.identifySpeakers);
        setOperation(free?.id ?? saved.id);
      }
      setService(restoredService);
      setPaidOperation(paid);
      setFreeOperation(free);
      setUsePro(!!paid);
      if (!committed && paid?.authorizationDeniedBeforeUpload === true) {
        setJob({ state: 'FAILED' });
        setProDenied(true);
        setMessage('Pro authorization is unavailable or expired. Check your API key.');
      }
      if (committed) {
        await showCompletion(committed);
        if (!active) return;
        setServiceReady(true);
        if (paid && !paid.voiceIdentification) await clientForOperation(paid).cleanup(paid, recording.name).catch(() => { if (active) setMessage('Saved locally. Service cleanup will retry when reopened.'); });
        return;
      }
      if (restoredService === 'openai') {
        const configured = await openAIAccess.profile();
        if (active) { setOpenAIConfigured(configured); setServiceReady(true); }
      } else {
        const profile = supportsProUpload ? await clientForService(restoredService).profile() : undefined;
        if (active) {
          setProAvailable(!!profile);
          setUsePro(!!paid || (!saved && !!profile));
          setServiceReady(true);
        }
      }
    }
    void restore().catch(error => {
      if (active) setMessage(error instanceof Error && error.message === 'The original transcript needs recovery. It has not been changed.'
        ? error.message : 'Could not connect. Retry when online.');
    })
      .finally(() => { if (active) setConnecting(false); });
    return () => { active = false; submission.current?.abort(); };
  }, [operationKey, restoreAttempt]);

  async function request(free: FreeOperation | LegacyFreeOperation | undefined, upload: boolean, signal: AbortSignal | undefined, paid: ProOperation | undefined, onTransfer?: () => void) {
    let result: Job;
    if (paid) {
      if (upload && !supportsProUpload) throw new Error('Pro uploads are unavailable on iOS.');
      const operationClient = clientForOperation(paid);
      result = upload
        ? await operationClient.upload(paid, recording.name, recording, () => hashRecording(recording, signal), signal, onTransfer)
        : await operationClient.read(paid, recording.name, signal);
    } else {
      if (!free) throw new KnownServiceFailure('Could not recover this recording’s Free operation.');
      const guest = await restoreGateway(free).catch(() => {
        throw new KnownServiceFailure('Could not restore Free access for this recording’s original operation.');
      });
      result = await requestGuestJob(guest, { ...free, accountScope: guest.accountScope }, upload ? recording : undefined, signal);
    }
    const local = await persistResult(result);
    if (paid && !paid.voiceIdentification && result.state === 'COMPLETED') {
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
  const operationEnded = terminal.has(job?.state ?? '');
  const canOfferVoiceProfiles = voiceProfileStageEnabled(service) && supportsProUpload && usePro &&
    serviceReady && !connecting && !statusUnknown && (!operation || operationEnded);
  const voiceProfileOperation = voiceProfileStageEnabled(service) &&
    paidOperation?.workerURL === services.staging.workerURL && paidOperation.voiceIdentification ? paidOperation : undefined;
  const showingOriginal = showOriginal ?? !!voiceProfileOperation;
  const voiceLookup = voiceProfileResult?.operation === voiceProfileOperation ? voiceProfileResult : undefined;
  const voiceReview = voiceLookup?.review;
  const recordingName = recording.name;
  useEffect(() => {
    // A completed job reaches the screen only through the durable original receipt.
    if (!complete || !voiceProfileOperation) return;
    const controller = new AbortController();
    const client = clientForOperation(voiceProfileOperation);
    void finishVoiceAfterSavingOriginal({
      client, operation: voiceProfileOperation, recording: recordingName,
      originalSaved: true, signal: controller.signal,
    }).then(async result => {
      if (controller.signal.aborted || result.status === 'pending') return;
      const review = result.status === 'ready' && result.result.status === 'completed'
        ? summarizeVoiceProfileResult(result.result.segments) : undefined;
      setVoiceProfileResult({ operation: voiceProfileOperation, review });
      // An unavailable lookup can be retried on reopen if the service never confirmed a terminal result.
      if (result.status === 'ready') {
        await client.cleanup(voiceProfileOperation, recordingName).catch(() => {
          if (!controller.signal.aborted) setMessage('Saved locally. Service cleanup will retry when reopened.');
        });
      }
    });
    return () => controller.abort();
  }, [complete, recordingName, voiceProfileOperation]);
  useEffect(() => {
    if (complete && !voiceProfileOperation && !busy && draftDocument && !revisionReadFailed && !autoOpened.current) {
      autoOpened.current = true;
      setEditingDraft(true);
    }
  }, [complete, voiceProfileOperation, busy, draftDocument, revisionReadFailed]);
  async function readCommittedRevision() {
    const snapshot = await draftDocument?.recover();
    if (snapshot) return draftText(snapshot);
    return revision.exists ? revision.text() : undefined;
  }
  useEffect(() => {
    if ((!freeOperation && !paidOperation) || connecting || !serviceReady || busy || complete || statusUnknown || operationEnded) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await readOperationWithDeadline(
          signal => request(freeOperation, false, signal, paidOperation), controller.signal,
        );
        if (pending.has(result.state) && !controller.signal.aborted) timer = setTimeout(poll, 3000);
      } catch (error) {
        if (!controller.signal.aborted) {
          const denied = speakerUnavailable(error);
          if (denied) setJob({ state: 'FAILED' });
          setStatusUnknown(!denied);
          setMessage(statusRecoveryMessage(error));
        }
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [freeOperation, connecting, serviceReady, busy, complete, paidOperation, statusUnknown, operationEnded]);

  async function checkOperationStatus() {
    if ((!freeOperation && !paidOperation) || busy || submission.current) return;
    setBusy(true);
    setMessage('');
    const controller = new AbortController();
    submission.current = controller;
    try {
      const result = await readOperationWithDeadline(
        signal => request(freeOperation, false, signal, paidOperation), controller.signal,
      );
      setStatusUnknown(false);
      setMessage(pending.has(result.state)
        ? 'The same operation is still in progress. This check did not upload your audio again.'
        : result.state === 'COMPLETED' ? 'Transcript recovered from the same operation.'
          : result.state === 'RESERVED' ? 'This operation is ready to retry.' : 'This operation has ended.');
    } catch (error) {
      const denied = speakerUnavailable(error);
      if (denied) setJob({ state: 'FAILED' });
      setStatusUnknown(!denied);
      setMessage(statusRecoveryMessage(error));
    } finally {
      if (submission.current === controller) submission.current = null;
      setBusy(false);
    }
  }

  async function submit() {
    if ((!supportsProUpload && (usePro || service === 'production')) || connecting || !serviceReady || submission.current || busy) return;
    const terminalJob = !!job && terminal.has(job.state);
    if (isOpenAI ? !openAIConfigured && !unsavedOpenAI
      : statusUnknown || (!!operation && job?.state !== 'RESERVED' && !terminalJob)) return;
    const startingPro = !isOpenAI && usePro && (!operation || terminalJob);
    setBusy(true);
    setMessage('');
    const controller = new AbortController();
    submission.current = controller;
    let openAIRequestStarted = false;
    let serviceRequestStarted = false;
    let freshPaid: ProOperation | undefined;
    let paidTransferStarted = false;
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
      let paid = terminalJob ? undefined : paidOperation;
      let free: FreeOperation | undefined;
      if (startingPro) {
        if (!supportsProUpload) throw new Error('Pro uploads are unavailable on iOS.');
        if (!proClient) throw new Error('Pro is not configured for this build.');
        const profile = await proClient.profile();
        if (!profile) throw new Error('Configure your InnoSage Pro API key first.');
        const accountScope = await proClient.identity(profile.key, controller.signal);
        controller.signal.throwIfAborted();
        paid = { lane: 'pro', id: `recorder-transcription-v2-${Math.floor(Date.now() / 1000) + 86400}-${randomUUID()}`,
          identifySpeakers, workerURL: proClient.workerURL, accountScope, sourceBytes: recording.size,
          ...(canOfferVoiceProfiles && identifySpeakers && matchVoiceProfiles ? { voiceIdentification: {} } : {}) };
        freshPaid = paid;
      } else if (!paid) {
        if (!gatewayAvailable(service)) throw new KnownServiceFailure('Free transcription is unavailable for this environment in this build.');
        const sizeLimit = freeRecordingLimit(recording.size);
        if (sizeLimit) throw new KnownServiceFailure(sizeLimit);
        const limit = freeRecordingLimit(recording.size, await recordingDurationMillis(recording).catch(() => undefined));
        if (limit) throw new KnownServiceFailure(limit);
        const existing = terminalJob ? undefined : freeOperation;
        const guest = existing ? await restoreGateway(existing) : await connectGateway(service);
        controller.signal.throwIfAborted();
        free = { lane: 'free', id: existing?.id ?? randomUUID(), identifySpeakers: existing?.identifySpeakers ?? identifySpeakers,
          service: guest.service, accountScope: guest.accountScope };
      }
      const next = paid ?? free;
      if (!next) throw new KnownServiceFailure('Could not recover the transcription operation.');
      await SecureStore.setItemAsync(operationKey, JSON.stringify(next));
      setPaidOperation(paid);
      setFreeOperation(free);
      setOperation(next.id);
      setJob({ state: 'RESERVED' });
      if (startingPro) {
        setProDenied(false);
        setMatchVoiceProfiles(false);
      }
      controller.signal.throwIfAborted();
      const timeout = paid ? undefined : setTimeout(() => controller.abort(), 60_000);
      try {
        serviceRequestStarted = true;
        await request(free, true, controller.signal, paid, () => { paidTransferStarted = true; });
        setStatusUnknown(false);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const failure = error instanceof Error ? error.message : undefined;
      const openAIDefinitiveFailure = !!failure && /^(OpenAI rejected this API key\.|Check that your OpenAI project key|Check your OpenAI project quota|OpenAI rejected the recording size\.|Choose a non-empty M4A recording|Enter an OpenAI Platform API key\.)/.test(failure);
      const knownServiceFailure = error instanceof KnownServiceFailure || error instanceof ProServiceError || !!failure && /^(This recording exceeds the supported file size\.|This recording or speaker identification is unavailable\.|This source exceeds 512 MiB or has changed\.|This source exceeds the service limit\.)/.test(failure);
      const proAuthorizationDenied = usePro && error instanceof ProServiceError && error.code === 'authorization';
      const mayOfferFreeAfterDenial = proAuthorizationDenied && startingPro && !paidTransferStarted;
      if (isOpenAI) {
        setStatusUnknown(false);
        setMessage(openAIRequestStarted && !openAIDefinitiveFailure
          ? 'OpenAI transcription may have completed, but its status cannot be checked here. Confirm before retrying to avoid duplicate submission; the original audio remains on this device.'
          : failure ?? 'Could not save the transcript.');
      } else {
        const mustRecoverPaid = proAuthorizationDenied && !mayOfferFreeAfterDenial;
        const uncertainOperation = serviceRequestStarted && (!knownServiceFailure || mustRecoverPaid);
        setStatusUnknown(uncertainOperation);
        if (uncertainOperation) {
          setMessage(mustRecoverPaid
            ? 'Pro authorization is unavailable or expired. Restore access and check the same operation before retrying.'
            : 'Connection interrupted. Status is unknown. Check this same operation before retrying; your original audio remains on this device.');
        } else setMessage(failure ?? 'Could not submit the recording.');
      }
      if (speakerUnavailable(error)) setJob({ state: 'FAILED' });
      if (mayOfferFreeAfterDenial) {
        if (freshPaid) {
          try {
            const denied: StoredProOperation = { ...freshPaid, authorizationDeniedBeforeUpload: true };
            await SecureStore.setItemAsync(operationKey, JSON.stringify(denied));
            setJob({ state: 'FAILED' });
            setProDenied(true);
          } catch {
            setMessage('Could not save the authorization result. Retry this operation when access is available.');
          }
        } else setProDenied(true);
      }
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
  const canUseFree = !isOpenAI && gatewayAvailable(service);
  const canChangeInnoSagePlan = canUseFree && canChooseSpeakers && (proAvailable || proDenied);
  const retryService = () => {
    setMessage('');
    setConnecting(true);
    setRestoreAttempt(attempt => attempt + 1);
  };
  const input = { color: palette.text, borderColor: palette.border, borderWidth: 1, padding: spacing.sm };
  return (
    <Modal onRequestClose={requestClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
        <AppHeader title="Transcript" onBack={requestClose} backLabel={backLabel} backDisabled={!canGoBack} />
        <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <Text style={{ color: palette.text }}>{recordingTitle}</Text>
          {!canGoBack ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted }}>Finish the current operation or save its result before leaving.</Text> : null}
          {complete || isOpenAI ? <View style={[styles.serviceCard, { backgroundColor: palette.surface }]}>
            <Text style={{ color: palette.text, fontWeight: '600' }}>{services[service].label}</Text>
            {isOpenAI ? <>
              <Text style={{ color: palette.muted }}>Transcription sends this M4A recording directly to OpenAI Platform and uses your project quota.</Text>
              <Text style={{ color: palette.muted }}>Limit: M4A under 25 MB.</Text>
            </> : null}
          </View> : null}
          {isOpenAI && !complete ? <Text style={{ color: palette.muted }}>{operation ? 'This job keeps its original service.' : 'Change the default in Transcription service, then reopen this recording.'}</Text> : null}
          {message ? <Text accessibilityLiveRegion="polite" style={{ color: palette.text }}>{message}</Text> : null}
          {!complete && canOfferVoiceProfiles ? <View style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ ...typography.body, color: palette.text, flex: 1 }}>Match saved voice profiles</Text>
              <RecorderSwitch label="Match saved voice profiles" value={matchVoiceProfiles}
                enabled={!busy && identifySpeakers} onCheckedChange={setMatchVoiceProfiles} />
            </View>
            <Text style={{ ...typography.body, color: palette.muted }}>
              {identifySpeakers ? 'Check this recording for matches with saved voice profiles.' : 'Turn on Identify speakers to use saved voice profiles.'}
            </Text>
          </View> : null}
          {complete ? (
            <>
              <Text accessibilityRole="header" style={{ color: palette.text, fontWeight: '600' }}>{showingOriginal ? 'Original transcript' : 'Editable revision'}</Text>
              <Text style={{ color: palette.muted }}>{isOpenAI ? 'OpenAI' : 'Edge Speech'} · {showingOriginal ? 'Saved locally; read-only' : dirty ? 'Unsaved changes' : draftRevision > 0 || revision.exists ? 'Saved locally' : 'Not saved yet'}</Text>
              {job?.speakerLabeling?.requested ? <Text style={{ color: palette.muted }}>
                {job.speakerLabeling.status === 'completed'
                  ? 'Speakers identified. Labels distinguish voices, not people’s names.'
                  : 'Speaker identification could not be completed. The transcript is available.'}
              </Text> : null}
              {showingOriginal || !hasDraftEditor ? <TextInput
                accessibilityLabel="Transcript text" multiline editable={!hasDraftEditor && !revisionReadFailed && canEditTranscript(showingOriginal, busy)}
                value={showingOriginal ? job?.transcript : draft} onChangeText={value => { setDraft(value); setDirty(true); }}
                style={[input, { minHeight: 180, textAlignVertical: 'top' }, showingOriginal && voiceProfileOperation && styles.voiceOriginal]} /> : null}
              {voiceProfileOperation ? <VoiceProfileStatus
                pending={!voiceLookup} available={!!voiceReview}
                matchedCount={voiceReview?.matchedCount ?? 0} reviewCount={voiceReview?.reviewCount ?? 0}
                unknownCount={voiceReview?.unknownCount ?? 0}
                expandedReview={voiceLookup?.expanded ? voiceReview?.reviewBySpeaker : undefined}
                onReview={() => setVoiceProfileResult(current => current && { ...current, expanded: !current.expanded })} /> : null}
              {!showingOriginal && hasDraftEditor ? <ActionButton
                title="Open in Draft" variant="primary" disabled={busy || summaryLocked || !draftDocument || revisionReadFailed}
                onPress={() => setEditingDraft(true)} /> : null}
              <ActionButton title={showingOriginal ? 'Show revision' : 'Show original'} disabled={busy} onPress={() => setShowOriginal(!showingOriginal)} />
              {!showingOriginal && !hasDraftEditor ? <ActionButton title="Save revision" variant="primary" disabled={busy || revisionReadFailed} onPress={save} /> : null}
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
          ) : (
            <InnoSageTranscriptAction
              serviceLabel={services[service].label}
              loading={connecting}
              serviceReady={serviceReady}
              canUseFree={canUseFree}
              supportsPro={supportsProUpload}
              usePro={usePro}
              canChoosePro={canChangeInnoSagePlan}
              proDenied={proDenied}
              isProduction={service === 'production'}
              hasOperation={!!operation}
              jobState={job && (stateLabels[job.state] ?? job.state)}
              operationEnded={operationEnded}
              operationPending={!!operation && (!job || pending.has(job.state))}
              statusUnknown={statusUnknown}
              identifySpeakers={identifySpeakers}
              canChooseSpeakers={canChooseSpeakers}
              busy={busy}
              onUsePro={value => {
                setUsePro(value);
                setProDenied(false);
                setMessage('');
                if (!value) setMatchVoiceProfiles(false);
              }}
              onIdentifySpeakers={value => {
                setIdentifySpeakers(value);
                if (!value) setMatchVoiceProfiles(false);
              }}
              onRetryService={retryService}
              onCheckStatus={checkOperationStatus}
              onTranscribe={submit}
            />
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
  serviceCard: { padding: 16, gap: 8, borderRadius: 20 } as const,
  voiceOriginal: { maxHeight: 180 },
};
