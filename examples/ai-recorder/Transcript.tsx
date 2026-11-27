import { DraftSummary } from './DraftSummary';
import { SavedRecordingSummary, TranscriptSummary } from './TranscriptSummary';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { recordingDurationMillis, supportsProUpload } from './NativeUpload';
import { SafeAreaView } from 'react-native-safe-area-context';
import { readTranscriptSidecar, transferTranscript } from './transcriptTransfer';
import { randomUUID } from 'expo-crypto';
import { draftTranscriptMarkdown, transcriptMarkdown } from './transcriptExport';
import { prepareRecorderOpen } from './recorderDraftProtocol';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { AppHeader } from './ui/AppChrome';
import { ActionButton } from './ui/ActionButton';
import { canEditTranscript, canLeaveTranscript } from './ui/navigation';
import { useTheme } from './ui/theme';
import { RecorderSwitch } from './RecorderSwitch';
import { draftEditorIsBundled, createDraftDocument } from './draftDocumentStore';
import { draftText } from './draftDocumentModel';
import { RecorderDraftHost } from './RecorderDraftHost';

import {
  clientForService, clientForOperation, selectedService, hashRecording,
  enrollConfirmedStageClip, readPendingConfirmedStageClip, resumeConfirmedStageClip,
} from './ProAccess';
import { openAIAccess } from './OpenAIAccess';
import { openAIMaxBytes } from './OpenAIClient';
import { services, serviceForWorker, type ServiceId } from './ServiceConfig';
import { ProServiceError, type ProClient, type ProOperation, type VoiceIdentification, type VoiceProfileSummary, type VoiceSegment } from './ProClient';
import { readableSpeakerTranscript } from './speakerTranscript';
import { persistTranscriptCompletion, readCommittedTranscript, parseSpeakerResult, type CompletedTranscript, type SpeakerResult } from './transcriptCompletion';
import { connectGateway, gatewayAvailable, GuestSpeakerUnavailable, requestGuestJob, restoreGateway } from './GatewayConnection';
import { freeRecordingLimit, readFreeOperation, type FreeOperation, type LegacyFreeOperation } from './GatewayGuest';
import { InnoSageTranscriptAction } from './ui/InnoSageTranscriptAction';
import { KnownServiceFailure, readOperationWithDeadline, statusRecoveryMessage } from './operationRecovery';
import { finishVoiceAfterSavingOriginal, readLocalVoiceReceipt, voiceProfileStageEnabled, writeLocalVoiceReceipt, type LocalVoiceReceipt } from './VoiceProfileFlow';
import { reviewLiveVoiceSegments, type VoiceReviewRow, type VoiceSource } from './VoiceProfileReview';
import { ConfirmedVoiceClip, type ConfirmedVoiceClipSelection } from './ui/voice-profile/confirmed-voice-clip';
import { VoiceSpeakerReview } from './ui/voice-profile/voice-speaker-review';
import { summarizeVoiceProfileResult, VoiceProfileStatus, type VoiceProfileReview } from './ui/voice-profile/voice-profile-status';
import { readSavedRecordingSummary, readSavedTranscriptEdit, type RecordingDocumentDestination } from './savedRecordingDocuments';
import { knownRecordingDuration, recordingDate, recordingDayLabel, recordingTimeLabel, type RecordingSummary } from './ui/recording-display';
import { transcriptReaderBlocks } from './ui/document-content';
type Job = { state: string; transcript?: string; speakerLabeling?: SpeakerResult };
type StoredProOperation = ProOperation & { authorizationDeniedBeforeUpload?: true };
type CompletedVoiceIdentification = Extract<VoiceIdentification, { status: 'completed' }>;
type LiveVoiceReview = {
  operation: ProOperation;
  originalUri: string;
  rows: readonly VoiceReviewRow[];
  namesUnavailable: boolean;
  exactObservedResult?: CompletedVoiceIdentification;
};
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

async function confirmVoiceReview(client: ProClient, operation: ProOperation, recordingName: string, signal: AbortSignal) {
  const { workerURL, accountScope } = operation;
  const budgetMs = 3000;
  const deadline = performance.now() + budgetMs;
  return readOperationWithDeadline(lookupSignal => new Promise<{
    profiles: VoiceProfileSummary[]; result: CompletedVoiceIdentification;
  } | undefined>(resolve => {
    if (lookupSignal.aborted) {
      resolve(undefined);
      return;
    }
    const unavailable = () => resolve(undefined);
    lookupSignal.addEventListener('abort', unavailable, { once: true });

    async function confirm() {
      const profiles = await client.listVoiceProfiles({ workerURL, accountScope }, lookupSignal);
      if (lookupSignal.aborted || performance.now() >= deadline) return;
      // Recheck matching revisions on the same job after reading the profile names.
      const observed = await client.readVoiceIdentification(operation, recordingName, lookupSignal);
      if (lookupSignal.aborted || performance.now() >= deadline || observed?.result.status !== 'completed') return;
      return { profiles, result: observed.result };
    }

    void confirm().then(resolve, unavailable)
      .finally(() => lookupSignal.removeEventListener('abort', unavailable));
  }), signal, budgetMs);
}

function sameVoiceSource(left: VoiceSource, right: Pick<VoiceSegment, 'segmentId' | 'startMs' | 'endMs' | 'speakerId'>) {
  return left.segmentId === right.segmentId && left.speakerId === right.speakerId &&
    left.startMs === right.startMs && left.endMs === right.endMs;
}

function confirmedClipSources(review: LiveVoiceReview | undefined): VoiceSource[] {
  const segments = review?.exactObservedResult?.segments;
  if (!review || !segments) return [];
  return review.rows.filter(row => {
    const duration = row.endMs - row.startMs;
    // Reviewed bounds come from the parsed result, which caps source time at four hours.
    return duration >= 2_000 && duration <= 30_000 &&
      segments.some(segment => sameVoiceSource(row, segment)) &&
      !segments.some(segment => segment.speakerId !== row.speakerId &&
        segment.startMs < row.endMs && segment.endMs > row.startMs && segment.endMs > segment.startMs);
  }).map(({ segmentId, speakerId, startMs, endMs }) => ({ segmentId, speakerId, startMs, endMs }));
}

type TranscriptProps = {
  recording: File;
  recordingTitle: string;
  recordingSummary?: RecordingSummary;
  backLabel?: string;
  onClose: () => void;
  initialDocument?: RecordingDocumentDestination;
};

export function Transcript({ initialDocument, ...props }: TranscriptProps) {
  return initialDocument === 'summary' ? <SavedRecordingSummary {...props} /> : <RecordingTranscript {...props} />;
}

function RecordingTranscript({ recording, recordingTitle, recordingSummary, backLabel = 'Back to library', onClose }: TranscriptProps) {
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
  const [liveVoiceReview, setLiveVoiceReview] = useState<LiveVoiceReview>();
  const [job, setJob] = useState<Job>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusUnknown, setStatusUnknown] = useState(false);
  const [summaryLocked, setSummaryLocked] = useState(false);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const seededRevision = useRef(false);
  const [revisionReadFailed, setRevisionReadFailed] = useState(false);
  const [revisionOnly, setRevisionOnly] = useState(false);
  const [originalChoice, setShowOriginal] = useState<boolean>();
  const hasDraftEditor = useMemo(draftEditorIsBundled, []);
  const [draftDocument, setDraftDocument] = useState<Awaited<ReturnType<typeof createDraftDocument>>>();
  const [editingDraft, setEditingDraft] = useState(false);
  const [editingReader, setEditingReader] = useState(false);
  const [showSummaryTools, setShowSummaryTools] = useState(false);
  const [showSavedSummary, setShowSavedSummary] = useState(false);
  const [summaryAvailable, setSummaryAvailable] = useState(false);
  const beforeEdit = useRef('');
  const [draftRevision, setDraftRevision] = useState(0);
  const autoOpened = useRef(false);
  const exportPending = useRef(false);
  const android = Platform.OS === 'android';
  const recordingUri = recording.uri;
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
  const committedResult = (onOriginal?: (transcript: string) => void) =>
    readCommittedTranscript(original.uri, onOriginal ? {
      ...completionFiles,
      readOriginal: async () => {
        const transcript = await completionFiles.readOriginal();
        if (transcript?.trim()) onOriginal(transcript);
        return transcript;
      },
    } : completionFiles);

  async function showCompletion(committed: CompletedTranscript) {
    if (!seededRevision.current) {
      try {
        const { document, revisionNumber, text: savedRevision } = await readSavedTranscriptEdit(recording);
        // Once editors can accept input, even a replay with a clean draft cannot reseed the view.
        if (!seededRevision.current) {
          seededRevision.current = true;
          setDraftDocument(document);
          setDraftRevision(revisionNumber);
          setRevisionReadFailed(false);
          setDraft(savedRevision ?? readableSpeakerTranscript(committed.transcript, committed.speakerLabeling?.transcript));
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
      let originalFailure: unknown;
      const committed = await committedResult(transcript => {
        if (active) setJob({ state: 'COMPLETED', transcript });
      }).catch(error => { originalFailure = error; return undefined; });
      if (!active) return;
      if (committed) {
        await showCompletion(committed);
      } else if (android) {
        // Older recordings can retain a committed edit after losing their original.
        // Recover it for export without starting a transcription or inventing an original.
        try {
          const edit = await readSavedTranscriptEdit(recording);
          if (!active) return;
          if (edit.text !== undefined) {
            setDraftDocument(edit.document);
            setRevisionOnly(true);
            return;
          }
        } catch {
          if (active) {
            setRevisionOnly(true);
            setRevisionReadFailed(true);
            setMessage('The saved revision could not be read. Reopen this recording to retry.');
          }
          return;
        }
      }
      if (originalFailure) throw originalFailure;
      if (!active) return;
      const savedOperation = await SecureStore.getItemAsync(operationKey);
      // Persisted jobs take precedence over the new-job preference, including old Free UUIDs.
      const saved = savedOperation?.startsWith('{') ? JSON.parse(savedOperation) : savedOperation;
      const paid: StoredProOperation | undefined = saved?.lane === 'pro' ? saved : undefined;
      const free = saved && saved.lane !== 'openai' && !paid ? readFreeOperation(saved) : undefined;
      const restoredService: ServiceId = paid ? serviceForWorker(paid.workerURL) : free ? free.service
        : saved?.lane === 'openai' ? 'openai' : await selectedService();
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
        setServiceReady(true);
        if (paid && (!paid.voiceIdentification || !voiceProfileStageEnabled(restoredService))) {
          await clientForOperation(paid).cleanup(paid, recording.name).catch(() => {
            if (active) setMessage('Saved locally. Service cleanup will retry when reopened.');
          });
        }
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
    if (paid) {
      const cleanupOnly = !!paid.voiceIdentification && !voiceProfileStageEnabled(serviceForWorker(paid.workerURL));
      const saved = cleanupOnly ? await committedResult() : undefined;
      if (cleanupOnly) signal?.throwIfAborted();
      if (cleanupOnly && !saved && upload) {
        throw new KnownServiceFailure('Voice matching is off. Check this operation’s status without uploading again.');
      }
      if (!saved && upload && !supportsProUpload) throw new Error('Pro uploads are unavailable on iOS.');
      const operationClient = clientForOperation(paid);
      const result = saved ?? (upload
        ? await operationClient.upload(paid, recording.name, recording, () => hashRecording(recording, signal), signal, onTransfer)
        : await operationClient.read(paid, recording.name, signal));
      const local = saved ?? await persistResult(result);
      if (saved) await showCompletion(saved);
      const shouldCleanup = cleanupOnly
        ? local.state === 'COMPLETED' && !signal?.aborted
        : !paid.voiceIdentification && result.state === 'COMPLETED';
      if (shouldCleanup) {
        await operationClient.cleanup(paid, recording.name).catch(() => {
          if (!cleanupOnly || !signal?.aborted) setMessage('Saved locally. Service cleanup will retry when reopened.');
        });
      }
      return local;
    }
    if (!free) throw new KnownServiceFailure('Could not recover this recording’s Free operation.');
    const guest = await restoreGateway(free).catch(() => {
      throw new KnownServiceFailure('Could not restore Free access for this recording’s original operation.');
    });
    return persistResult(await requestGuestJob(guest, { ...free, accountScope: guest.accountScope }, upload ? recording : undefined, signal));
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
  const voiceProfilesEnabled = voiceProfileStageEnabled(service);
  const canOfferVoiceProfiles = voiceProfilesEnabled && supportsProUpload && usePro &&
    serviceReady && !connecting && !statusUnknown && (!operation || operationEnded);
  const voiceProfileOperation = paidOperation?.workerURL === services.staging.workerURL &&
    paidOperation.voiceIdentification ? paidOperation : undefined;
  const showOriginal = originalChoice ?? ((complete && !!voiceProfileOperation) || (!android && connecting));
  const voiceLookup = voiceProfileResult?.operation === voiceProfileOperation ? voiceProfileResult : undefined;
  const voiceReview = voiceLookup?.review;
  const recordingName = recording.name;
  const originalUri = original.uri;
  const liveReview = liveVoiceReview?.operation === voiceProfileOperation && liveVoiceReview?.originalUri === originalUri
    ? liveVoiceReview : undefined;
  const clipOperation = supportsProUpload && voiceProfilesEnabled && complete && !connecting && showOriginal &&
    !editingDraft && voiceProfileOperation?.lane === 'pro' && voiceProfileOperation.identifySpeakers === true &&
    original.exists && recording.exists ? voiceProfileOperation : undefined;
  const clipSources = useMemo(() => confirmedClipSources(clipOperation ? liveReview : undefined), [clipOperation, liveReview]);

  async function submitConfirmedClip(selection: ConfirmedVoiceClipSelection, signal: AbortSignal) {
    if (!clipOperation || !original.exists || !recording.exists || AppState.currentState !== 'active' ||
        selection.participantConfirmed !== true) throw new Error('Clip confirmation is unavailable.');
    signal.throwIfAborted();
    const pendingClip = await readPendingConfirmedStageClip(clipOperation);
    signal.throwIfAborted();
    if (!original.exists || !recording.exists || AppState.currentState !== 'active')
      throw new Error('Clip confirmation is unavailable.');
    const confirmation = {
      segmentId: selection.source.segmentId, displayName: selection.displayName, participantConfirmed: true as const,
    };
    if (selection.kind === 'resume') {
      if (!pendingClip || !sameVoiceSource(selection.source, pendingClip)) throw new Error('Pending clip changed.');
      await resumeConfirmedStageClip(clipOperation, recording, confirmation, signal);
      return;
    }
    const exactObservedResult = liveReview?.exactObservedResult;
    if (pendingClip || !exactObservedResult || !clipSources.some(source => sameVoiceSource(source, selection.source)))
      throw new Error('Clip confirmation is unavailable.');
    await enrollConfirmedStageClip(clipOperation, recording, exactObservedResult, confirmation, signal);
  }

  useEffect(() => {
    if (!complete || connecting || !voiceProfilesEnabled || !voiceProfileOperation) return;
    const operation = voiceProfileOperation;
    const controller = new AbortController();
    const { signal } = controller;
    const receiptKey = 'voiceprofile.receipt.' + recordingName;
    let namesLookup: AbortController | undefined;
    let namesTimer: ReturnType<typeof setTimeout> | undefined;

    function hideLiveNames(clearObservedResult = false) {
      namesLookup?.abort();
      clearTimeout(namesTimer);
      setLiveVoiceReview(current => {
        if (current?.operation !== operation || current.originalUri !== originalUri ||
            (!current.rows.some(row => row.liveName) && !(clearObservedResult && current.exactObservedResult))) return current;
        return {
          ...current,
          rows: current.rows.map(row => row.liveName ? { ...row, disposition: 'unknown', liveName: undefined } : row),
          exactObservedResult: clearObservedResult ? undefined : current.exactObservedResult,
        };
      });
    }

    const appState = supportsProUpload ? AppState.addEventListener('change', state => {
      if (state !== 'active') hideLiveNames(true);
    }) : undefined;

    async function restoreVoiceReview() {
      let receipt: LocalVoiceReceipt | undefined = await readLocalVoiceReceipt(SecureStore, receiptKey, operation, originalUri);
      if (signal.aborted) return;
      const client = clientForOperation(operation);
      let segments: readonly VoiceSegment[] | undefined;
      if (!receipt) {
        const result = await finishVoiceAfterSavingOriginal({
          client, operation, recording: recordingName, originalSaved: true, signal,
        });
        if (signal.aborted || result.status === 'pending') return;
        if (result.status === 'unavailable') {
          setVoiceProfileResult({ operation });
          return;
        }
        receipt = result.result.status === 'completed'
          ? { outcome: 'completed', review: summarizeVoiceProfileResult(result.result.segments) }
          : { outcome: 'failed' };
        if (supportsProUpload && result.result.status === 'completed') segments = result.result.segments;
        await writeLocalVoiceReceipt(SecureStore, receiptKey, operation, originalUri, receipt);
      }
      let confirmed: Awaited<ReturnType<typeof confirmVoiceReview>>;
      try {
        if (signal.aborted) return;
        setVoiceProfileResult({ operation, review: receipt.outcome === 'completed' ? receipt.review : undefined });
        if (segments && AppState.currentState === 'active') {
          namesLookup = new AbortController();
          confirmed = await confirmVoiceReview(client, operation, recordingName, namesLookup.signal).catch(() => undefined);
        }
      } finally {
        void client.cleanup(operation, recordingName).catch(() => {
          if (!signal.aborted) setMessage('Saved locally. Service cleanup will retry when reopened.');
        });
      }

      if (!segments || signal.aborted) return;
      const namesAreCurrent = !!namesLookup && !namesLookup.signal.aborted && AppState.currentState === 'active';
      const currentReview = namesAreCurrent ? confirmed : undefined;
      const rows = currentReview
        ? reviewLiveVoiceSegments(currentReview.result.segments, currentReview.profiles)
        : reviewLiveVoiceSegments(segments, []);
      setLiveVoiceReview({ operation, originalUri, rows, namesUnavailable: namesAreCurrent && !confirmed,
        exactObservedResult: currentReview?.result });
      if (rows.some(row => row.liveName)) namesTimer = setTimeout(hideLiveNames, 30_000);
    }
    void restoreVoiceReview().catch(() => {
      if (!signal.aborted) setVoiceProfileResult({ operation });
    });
    return () => {
      controller.abort();
      appState?.remove();
      namesLookup?.abort();
      clearTimeout(namesTimer);
      setLiveVoiceReview(current => current?.operation === operation && current.originalUri === originalUri ? undefined : current);
    };
  }, [complete, connecting, originalUri, recordingName, voiceProfileOperation, voiceProfilesEnabled]);
  useEffect(() => {
    if (!android && !voiceProfileOperation && !connecting && complete && !busy && hasDraftEditor && draftDocument && !revisionReadFailed && !autoOpened.current) {
      autoOpened.current = true;
      setEditingDraft(true);
    }
  }, [android, connecting, voiceProfileOperation, complete, busy, hasDraftEditor, draftDocument, revisionReadFailed]);
  useEffect(() => {
    if (!android || !complete || summaryLocked) return;
    let current = true;
    void readSavedRecordingSummary(new File(recordingUri)).then(
      saved => { if (current) setSummaryAvailable(!!saved); },
      () => { if (current) setSummaryAvailable(false); },
    );
    return () => { current = false; };
  }, [android, complete, recordingUri, summaryLocked]);
  async function readCommittedRevision() {
    if (revisionReadFailed) throw new Error('The saved transcript is not ready.');
    return (await readSavedTranscriptEdit(recording)).text;
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
      if (android && draftRevision > 0) {
        // An app update can remove the editor assets while its committed document
        // remains. Continue that revision so a new legacy sidecar cannot be hidden.
        if (!draftDocument) throw new Error();
        const updated = prepareRecorderOpen(draftDocument.pageId, recordingTitle, draft);
        if (!updated) throw new Error();
        const committed = await draftDocument.commit(draftRevision, updated.blocks);
        setDraftRevision(committed.revision);
      } else {
        await saveText(revision, draft);
      }
      setDirty(false);
      setEditingReader(false);
      setMessage('Revision saved on this device.');
    } catch {
      setMessage('Could not save the revision.');
    } finally {
      setBusy(false);
    }
  }

  async function exportTranscript(saveFile: boolean) {
    if (busy || exportPending.current || summaryLocked || revisionReadFailed || dirty) return;
    exportPending.current = true;
    setBusy(true);
    setMessage('');
    try {
      const { filename, markdown } = await transcriptMarkdown(recordingTitle, recording.name, {
        readDraft: async () => {
          // The on-disk page can outlive a build's optional editor assets.
          if (!draftDocument) throw new Error();
          const snapshot = await draftDocument.recover();
          return snapshot && { text: draftTranscriptMarkdown(snapshot), revision: snapshot.revision };
        },
        readLegacy: () => readTranscriptSidecar(revision),
        readOriginal: async () => {
          const saved = await readCommittedTranscript(original.uri, {
            readOriginal: () => readTranscriptSidecar(original),
            readSpeakers: completionFiles.readSpeakers,
          });
          return saved && { text: saved.transcript, attribution: saved.speakerLabeling?.transcript };
        },
      });
      const result = await transferTranscript(filename, markdown, saveFile);
      if (result === 'incomplete') setMessage('The destination may contain an incomplete file. Save again with a new filename, then check the last line.');
      if (result === 'occupied') setMessage('That document already contains data. Save again with a new filename.');
      if (result === 'saved') setMessage('Markdown file saved.');
    } catch {
      setMessage('Could not export the saved transcript. Check the saved revision and destination, then retry.');
    } finally {
      exportPending.current = false;
      setBusy(false);
    }
  }

  const canGoBack = canLeaveTranscript(busy, summaryLocked, !!unsavedOpenAI);
  function requestClose() {
    if (!canGoBack) return;
    const goBack = () => {
      if (android && showSummaryTools) setShowSummaryTools(false);
      else if (android && showOriginal) setShowOriginal(false);
      else if (android && editingReader) {
        if (dirty) {
          setDraft(beforeEdit.current);
          setDirty(false);
        }
        setEditingReader(false);
      } else onClose();
    };
    if (dirty) {
      Alert.alert('Discard unsaved revision?', 'Your saved transcript will not change.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: goBack },
      ]);
    } else goBack();
  }

  const canChooseSpeakers = !busy && (!operation || ['FAILED', 'CANCELLED', 'CLEANED', 'EXPIRED'].includes(job?.state ?? ''));
  const canUseFree = !isOpenAI && gatewayAvailable(service);
  const canChangeInnoSagePlan = canUseFree && canChooseSpeakers && (proAvailable || proDenied);
  const retryService = () => {
    setMessage('');
    setConnecting(true);
    setRestoreAttempt(attempt => attempt + 1);
  };
  const exportDisabled = busy || dirty || revisionReadFailed || summaryLocked;
  const canSummarizeRevision = !revisionReadFailed && (draftRevision > 0 || revision.exists);
  const exportActions = android ? <>
    {dirty ? <Text style={{ color: palette.muted }}>Save your revision to export it.</Text> : null}
    <ActionButton title="Share transcript (.md)" disabled={exportDisabled}
      onPress={() => { void exportTranscript(false); }} />
    <ActionButton title="Save Markdown file" variant="outlined" disabled={exportDisabled}
      onPress={() => { void exportTranscript(true); }} />
  </> : null;
  const input = { color: palette.text, borderColor: palette.border, borderWidth: 1, padding: spacing.sm };
  const originalText = job?.transcript ?? '';
  const readerText = showOriginal ? originalText
    : seededRevision.current ? draft : readableSpeakerTranscript(originalText, job?.speakerLabeling?.transcript);
  const recordedOn = recordingDate(recordingSummary?.createdAt);
  const recordingMeta = recordedOn
    ? [recordingDayLabel(recordedOn, new Date()), recordingTimeLabel(recordedOn, 'minute')]
    : [];
  const readerMeta = [...recordingMeta, complete ? 'Saved on this device' : knownRecordingDuration(recordingSummary?.durationSeconds)]
    .filter(Boolean).join(' · ');
  const screenTitle = android && showOriginal ? 'Original transcript'
    : android && editingReader ? 'Edit transcript' : android && showSummaryTools ? 'Summary setup'
      : android && !complete && operation ? 'Transcription status' : 'Transcript';
  return (
    <Modal onRequestClose={requestClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
        <AppHeader title={screenTitle} quietTitle={android} onBack={requestClose}
          backLabel={android && (showOriginal || editingReader || showSummaryTools) ? 'Back to transcript' : backLabel}
          backDisabled={!canGoBack} />
        <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: android ? spacing.xxl : spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <Text accessibilityRole={android ? 'header' : undefined}
            style={android ? [typography.title, { color: palette.text }] : { color: palette.text }}>{recordingTitle}</Text>
          {android && readerMeta ? <Text style={[typography.dayLabel, { color: palette.muted }]}>{readerMeta}</Text> : null}
          {!canGoBack ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted }}>Finish the current operation or save its result before leaving.</Text> : null}
          {!android && (complete || isOpenAI) || isOpenAI && !complete ? <View style={!android ? [styles.serviceCard, { backgroundColor: palette.surface }] : { gap: spacing.xs }}>
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
              {(!android || (!editingReader && !showSummaryTools)) && <>
              {voiceProfilesEnabled && voiceProfileOperation ? <VoiceProfileStatus
                pending={!voiceLookup} available={!!voiceReview}
                matchedCount={voiceReview?.matchedCount ?? 0} reviewCount={voiceReview?.reviewCount ?? 0}
                unknownCount={voiceReview?.unknownCount ?? 0}
                expandedReview={voiceLookup?.expanded ? voiceReview?.reviewBySpeaker : undefined}
                onReview={() => setVoiceProfileResult(current => current && { ...current, expanded: !current.expanded })} /> : null}
              {clipOperation ? <ConfirmedVoiceClip
                key={JSON.stringify([recordingUri, originalUri, clipOperation.id, clipOperation.accountScope])}
                operation={clipOperation} sources={clipSources} onSubmit={submitConfirmedClip} /> : null}
              {supportsProUpload && voiceProfilesEnabled && voiceProfileOperation && showOriginal && !connecting && !editingDraft
                ? <VoiceSpeakerReview key={`${originalUri}:${voiceProfileOperation.id}`}
                  originalUri={originalUri} operationId={voiceProfileOperation.id}
                  correctionKey={`voiceprofile.corrections.${recordingName}.${voiceProfileOperation.id}`}
                  rows={liveReview?.rows} namesUnavailable={liveReview?.namesUnavailable} /> : null}
              </>}
              {android ? showSummaryTools ? null : editingReader ? <>
                <Text style={[typography.caption, { color: palette.muted }]}>
                  {dirty ? 'Unsaved changes' : revision.exists ? 'Saved revision' : 'New revision'}
                </Text>
                <TextInput accessibilityLabel="Transcript text" multiline editable={!busy && !revisionReadFailed}
                  value={draft} onChangeText={value => { setDraft(value); setDirty(true); }}
                  style={[input, typography.body, { minHeight: 180, textAlignVertical: 'top' }]} />
                <ActionButton title="Save revision" variant="primary" disabled={busy || revisionReadFailed} onPress={save} />
              </> : <>
                <View style={{ gap: spacing.lg, marginVertical: spacing.lg }}>
                  {!readerText.trim() ? <Text style={[typography.body, { color: palette.muted }]}>This revision is empty.</Text> : null}
                  {transcriptReaderBlocks(readerText).map((block, index) => (
                    <View key={index} style={{ gap: spacing.xs }}>
                      {block.timestamp ? <Text style={[typography.caption, { color: palette.muted }]}>
                        {block.endTimestamp ? `${block.timestamp} – ${block.endTimestamp}` : block.timestamp}
                      </Text> : null}
                      {block.text ? <Text selectable style={[typography.body, { color: palette.text }]}>{block.text}</Text> : null}
                    </View>
                  ))}
                </View>
                {!showOriginal ? <>
                  <ActionButton title="View original" variant="text" fullWidth={false} disabled={busy} onPress={() => setShowOriginal(true)} />
                  <ActionButton title="Edit transcript" variant="text" fullWidth={false}
                    disabled={busy || revisionReadFailed || (hasDraftEditor && !draftDocument)}
                    onPress={() => {
                      if (hasDraftEditor) setEditingDraft(true);
                      else { beforeEdit.current = draft; setEditingReader(true); }
                    }} />
                  {summaryAvailable ? <ActionButton title="Open summary" variant="text" fullWidth={false}
                    disabled={busy || summaryLocked}
                    onPress={() => { if (!exportPending.current) setShowSavedSummary(true); }} /> : null}
                  <ActionButton title={summaryAvailable ? 'Summary options' : 'Summarize'} variant="text" fullWidth={false}
                    disabled={busy || summaryLocked}
                    onPress={() => { if (!exportPending.current) setShowSummaryTools(true); }} />
                </> : null}
                {exportActions}
              </> : <>
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
                style={[input, { minHeight: 180, textAlignVertical: 'top' }, showOriginal && voiceProfileOperation && styles.voiceOriginal]} /> : null}
              {!showOriginal && hasDraftEditor ? <ActionButton
                title="Open in Draft" variant="primary" disabled={busy || summaryLocked || !draftDocument || revisionReadFailed}
                onPress={() => setEditingDraft(true)} /> : null}
              <ActionButton title={showOriginal ? 'Show revision' : 'Show original'} disabled={busy || connecting} onPress={() => setShowOriginal(!showOriginal)} />
              {!showOriginal && !hasDraftEditor ? <ActionButton title="Save revision" variant="primary" disabled={busy || revisionReadFailed} onPress={save} /> : null}
              </>}
              {!android || showSummaryTools ? hasDraftEditor ? <DraftSummary key={recordingUri} recordingUri={recordingUri} original={original}
                output={summaryFile} hasRevision={canSummarizeRevision} readRevision={readCommittedRevision}
                readRevisionWithId={async () => {
                  if (revisionReadFailed) throw new Error('The saved transcript is not ready.');
                  const saved = await readSavedTranscriptEdit(recording);
                  return saved.revisionNumber > 0
                    ? { text: saved.text ?? '', sourceRevision: saved.revisionNumber }
                    : { text: saved.text ?? '' };
                }}
                save={saveText} onLockChange={setSummaryLocked} /> : <TranscriptSummary original={original} hasRevision={canSummarizeRevision}
                readRevision={readCommittedRevision} output={summaryFile} save={saveText} onLockChange={setSummaryLocked}
                startOpen={android} /> : null}
            </>
          ) : revisionOnly ? (
            <>
              {!revisionReadFailed ? <Text style={{ color: palette.text }}>Your saved edit is available to export. The original transcript is unavailable.</Text> : null}
              {exportActions}
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
        initial={draft} onClose={() => setEditingDraft(false)} onCommitted={snapshot => {
          setDraftRevision(snapshot.revision);
          if (android) setDraft(draftText(snapshot));
        }} /> : null}
      {showSavedSummary ? <SavedRecordingSummary recording={recording} recordingTitle={recordingTitle} backLabel="Back to transcript"
        onClose={() => setShowSavedSummary(false)} /> : null}
    </Modal>
  );
}

const styles = {
  serviceCard: { padding: 16, gap: 8, borderRadius: 20 } as const,
  voiceOriginal: { maxHeight: 180 },
};
