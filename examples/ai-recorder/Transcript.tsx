import { TranscriptSummary } from './TranscriptSummary';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Button, KeyboardAvoidingView, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { Host, Switch } from '@expo/ui/jetpack-compose';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetch } from 'expo/fetch';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { AppHeader } from './ui/AppChrome';
import { canEditTranscript, canLeaveTranscript } from './ui/navigation';
import { useTheme } from './ui/theme';

import { clientForService, clientForOperation, selectedService, hashRecording } from './ProAccess';
import { openAIAccess } from './OpenAIAccess';
import { openAIMaxBytes } from './OpenAIClient';
import { services, serviceForWorker, type ServiceId } from './ServiceConfig';
import { ProServiceError, type ProOperation } from './ProClient';
import { readableSpeakerTranscript } from './speakerTranscript';
import { connectGateway, type Gateway } from './GatewayConnection';
type SpeakerResult = { requested: boolean; status: string; transcript?: string };
type Job = { state: string; transcript?: string; speakerLabeling?: SpeakerResult };
const stateLabels: Record<string, string> = {
  RESERVED: 'Ready to upload', UPLOADING: 'Uploading', STAGED: 'Preparing audio',
  QUEUED: 'Queued', PROCESSING: 'Transcribing', COMPLETED: 'Complete',
  FAILED: 'Transcription failed', CANCELLED: 'Cancelled', CLEANED: 'Expired', EXPIRED: 'Expired',
};
const pending = new Set(['UPLOADING', 'STAGED', 'QUEUED', 'PROCESSING']);

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
  const [summaryLocked, setSummaryLocked] = useState(false);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const original = new File(recording.parentDirectory, recording.name + '.original.txt');
  const summaryFile = new File(recording.parentDirectory, recording.name + '.summary.json');
  const revision = new File(recording.parentDirectory, recording.name + '.revision.txt');
  const speakerFile = new File(recording.parentDirectory, recording.name + '.speakers.json');
  const operationKey = 'transcription.' + recording.name;

  useEffect(() => {
    let active = true;
    async function restore() {
      const [savedOperation, originalText, revisedText, speakerText] = await Promise.all([
        SecureStore.getItemAsync(operationKey),
        original.exists ? original.text() : undefined,
        revision.exists ? revision.text() : undefined,
        speakerFile.exists ? speakerFile.text() : undefined,
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
      setProAvailable(!!profile);
      setUsePro(!!paid || (!savedOperation && !!profile));
      const speakers: SpeakerResult | undefined = speakerText ? JSON.parse(speakerText) : undefined;
      if (originalText !== undefined) {
        setJob({ state: 'COMPLETED', transcript: originalText, speakerLabeling: speakers });
        setDraft(revisedText !== undefined && revisedText !== speakers?.transcript
          ? revisedText : readableSpeakerTranscript(originalText, speakers?.transcript));
        if (paid) await clientForOperation(paid).cleanup(paid, recording.name).catch(() => { if (active) setMessage('Saved locally. Service cleanup will retry when reopened.'); });
        return;
      }
      if (restoredService === 'openai') {
        const configured = await openAIAccess.profile();
        if (active) setOpenAIConfigured(configured);
        return;
      }
      if (restoredService === 'production' || paid || (!savedOperation && profile)) return;
      if (process.env.EXPO_PUBLIC_RECORDER_GATEWAY_URL) {
        const config = await connectGateway();
        if (active) setGateway(config);
      } else {
        const saved = await SecureStore.getItemAsync('recorder.gateway');
        if (active && saved) setGateway(JSON.parse(saved));
      }
    }
    void restore().catch(() => { if (active) setMessage('Could not connect. Retry when online.'); })
      .finally(() => { if (active) setConnecting(false); });
    return () => { active = false; submission.current?.abort(); };
  }, [operationKey]);

  async function request(config: Gateway | undefined, id: string, upload: boolean, signal: AbortSignal | undefined, paid: ProOperation | undefined) {
    let result: Job;
    if (paid) {
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
        const failure = await response.json();
        if (failure.detail?.code === 'SPEAKER_UNAVAILABLE') setJob({ state: 'FAILED' });
        throw new Error(typeof failure.detail === 'string' ? failure.detail
          : failure.detail?.message ?? 'This recording could not be transcribed.');
      }
      if (!response.ok) throw new Error(response.status === 413
        ? 'This recording exceeds the Free upload limit.'
        : 'Could not reach or complete the transcription. Check the connection and retry.');
      result = await response.json();
    }
    await persistResult(result);
    if (paid && result.state === 'COMPLETED') {
      await clientForOperation(paid).cleanup(paid, recording.name).catch(() => setMessage('Saved locally. Service cleanup will retry when reopened.'));
    }
    return result;
  }

  async function persistResult(result: Job) {
    if (result.state === 'COMPLETED' && result.transcript) {
      if (result.speakerLabeling) await saveText(speakerFile, JSON.stringify(result.speakerLabeling));
      // The original is the local completion marker. Keep it last so recovery can finish metadata writes.
      if (!original.exists) await saveText(original, result.transcript);
      const savedRevision = revision.exists ? await revision.text() : undefined;
      setDraft(savedRevision !== undefined && savedRevision !== result.speakerLabeling?.transcript
        ? savedRevision : readableSpeakerTranscript(result.transcript, result.speakerLabeling?.transcript));
    }
    setJob(result);
  }

  const complete = job?.state === 'COMPLETED';
  useEffect(() => {
    if ((!gateway && !paidOperation) || !operation || busy || complete) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await request(gateway!, operation!, false, controller.signal, paidOperation);
        if (pending.has(result.state) && !controller.signal.aborted) timer = setTimeout(poll, 3000);
      } catch {
        if (!controller.signal.aborted) setMessage('Connection interrupted. Retry to resume this operation.');
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

  async function submit() {
    if (connecting || submission.current || busy || (isOpenAI ? !openAIConfigured && !unsavedOpenAI : !gateway && !usePro)) return;
    setBusy(true);
    setMessage('');
    const controller = new AbortController();
    submission.current = controller;
    try {
      if (isOpenAI) {
        if (recording.size <= 0 || recording.size >= openAIMaxBytes) {
          throw new Error('Choose a non-empty M4A recording smaller than 25 MB.');
        }
        const id = operation ?? randomUUID();
        await SecureStore.setItemAsync(operationKey, JSON.stringify({ id, identifySpeakers: false, lane: 'openai' }));
        setOperation(id);
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
      const terminal = job && ['FAILED', 'CANCELLED', 'CLEANED', 'EXPIRED'].includes(job.state);
      let paid = terminal ? undefined : paidOperation;
      if ((!operation || terminal) && usePro) {
        if (!proClient) throw new Error('Pro is not configured for this build.');
        const profile = await proClient.profile();
        if (!profile) throw new Error('Configure your InnoSage Pro API key first.');
        const accountScope = await proClient.identity(profile.key, controller.signal);
        controller.signal.throwIfAborted();
        paid = { lane: 'pro', id: `recorder-transcription-v2-${Math.floor(Date.now() / 1000) + 86400}-${randomUUID()}`,
          identifySpeakers, workerURL: proClient.workerURL, accountScope, sourceBytes: recording.size };
      }
      const id = paid?.id ?? (terminal ? randomUUID() : operation ?? randomUUID());
      await SecureStore.setItemAsync(operationKey, JSON.stringify(paid ?? { id, identifySpeakers, lane: 'free', service: 'staging' }));
      setPaidOperation(paid);
      setOperation(id);
      setJob({ state: 'RESERVED' });
      controller.signal.throwIfAborted();
      const timeout = paid ? undefined : setTimeout(() => controller.abort(), 60_000);
      try {
        await request(gateway, id, true, controller.signal, paid);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (error instanceof ProServiceError && error.code === 'speaker_unavailable') setJob({ state: 'FAILED' });
      setMessage(error instanceof Error ? error.message : 'Could not submit the recording.');
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
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={{ color: palette.text }}>{recordingTitle}</Text>
          {!canGoBack ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted }}>Finish the current operation or save its result before leaving.</Text> : null}
          <Text style={{ color: palette.muted }}>{services[service].label}</Text>
          {!complete ? <Text style={{ color: palette.muted }}>{operation ? 'This job keeps its original service.' : 'Change the default in Transcription service, then reopen this recording.'}</Text> : null}
          {message ? <Text accessibilityLiveRegion="polite" style={{ color: palette.text }}>{message}</Text> : null}
          {complete ? (
            <>
              <Text style={{ color: palette.muted }}>{isOpenAI ? 'OpenAI' : 'Edge Speech'} · {showOriginal ? 'Original' : 'Editable revision'}</Text>
              {job?.speakerLabeling?.requested ? <Text style={{ color: palette.muted }}>
                {job.speakerLabeling.status === 'completed'
                  ? 'Speakers identified. Labels distinguish voices, not people’s names.'
                  : 'Speaker identification could not be completed. The transcript is available.'}
              </Text> : null}
              <TextInput accessibilityLabel="Transcript text" multiline editable={canEditTranscript(showOriginal, busy)}
                value={showOriginal ? job?.transcript : draft} onChangeText={value => { setDraft(value); setDirty(true); }}
                style={[input, { minHeight: 180, textAlignVertical: 'top' }]} />
              <Button title={showOriginal ? 'Show revision' : 'Show original'} disabled={busy} onPress={() => setShowOriginal(!showOriginal)} />
              {!showOriginal ? <Button title="Save revision" disabled={busy} onPress={save} /> : null}
              <TranscriptSummary original={original} revision={revision} output={summaryFile} save={saveText} onLockChange={setSummaryLocked} />
            </>
          ) : isOpenAI ? (
            <>
              <Text style={{ color: palette.text }}>OpenAI · M4A under 25 MB</Text>
              {busy || connecting ? <ActivityIndicator accessibilityLabel="Connecting to OpenAI" /> : (openAIConfigured || unsavedOpenAI) ? (
                <Button title={unsavedOpenAI ? 'Retry save' : operation ? 'Retry transcription' : 'Transcribe'} onPress={submit} />
              ) : (
                <Text style={{ color: palette.text }}>Verify and save your OpenAI API key in Transcription service.</Text>
              )}
            </>
          ) : gateway || usePro ? (
            <>
              <Text style={{ color: palette.text }}>{usePro ? 'Pro · up to 4 hours · 512 MiB' : 'Free · up to 15 minutes · 50 MB'}</Text>
              {proAvailable ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: palette.text }}>Use InnoSage Pro</Text>
                <Host matchContents style={{ minWidth: 60 }}>
                  <Switch value={usePro} enabled={canChooseSpeakers && service === 'staging'} onCheckedChange={value => {
                    setUsePro(value);
                    if (!value && !gateway) void connect();
                  }} modifiers={[semantics({ contentDescription: 'Use InnoSage Pro' })]} />
                </Host>
              </View> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: palette.text }}>Identify speakers</Text>
                <Host matchContents style={{ minWidth: 60 }}>
                  <Switch value={identifySpeakers} onCheckedChange={setIdentifySpeakers} enabled={canChooseSpeakers}
                    modifiers={[semantics({ contentDescription: 'Identify speakers' })]} />
                </Host>
              </View>
              <Text style={{ color: palette.muted }}>Add speaker labels to this transcript. May take longer.</Text>
              {job ? <Text style={{ color: palette.text }}>{stateLabels[job.state] ?? job.state}</Text> : null}
              {busy ? <ActivityIndicator accessibilityLabel="Submitting recording" /> : null}
              <Button title={job && ['FAILED', 'CANCELLED', 'CLEANED', 'EXPIRED'].includes(job.state) ? 'Start new transcription' : operation ? 'Retry or resume' : 'Transcribe'} disabled={busy} onPress={submit} />
            </>
          ) : service === 'production' ? (
            <Text style={{ color: palette.text }}>Save and verify a production Pro key in Transcription service before starting. Free transcription is available on staging.</Text>
          ) : (
            <View style={{ gap: spacing.md }}>
              {process.env.EXPO_PUBLIC_RECORDER_GATEWAY_URL ? null : <>
              <TextInput accessibilityLabel="Gateway URL" placeholder="https://…" autoCapitalize="none" value={url} onChangeText={setUrl} style={input} />
              <TextInput accessibilityLabel="Pilot access token" placeholder="Pilot access token" secureTextEntry autoCapitalize="none" value={token} onChangeText={setToken} style={input} />
              </>}
              <Button title={connecting ? "Connecting…" : "Connect"} disabled={connecting} onPress={connect} />
            </View>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
