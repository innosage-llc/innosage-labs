import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetch } from 'expo/fetch';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from './ui/theme';

import { connectGateway, type Gateway } from './GatewayConnection';
type Job = { state: string; transcript?: string };
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

export function Transcript({ recording, onClose }: { recording: File; onClose: () => void }) {
  const { palette, spacing, typography } = useTheme();
  const [connecting, setConnecting] = useState(true);
  const [gateway, setGateway] = useState<Gateway>();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [operation, setOperation] = useState<string>();
  const [job, setJob] = useState<Job>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const original = new File(recording.parentDirectory, recording.name + '.original.txt');
  const revision = new File(recording.parentDirectory, recording.name + '.revision.txt');
  const operationKey = 'transcription.' + recording.name;

  useEffect(() => {
    let active = true;
    async function restore() {
      const [savedOperation, originalText, revisedText] = await Promise.all([
        SecureStore.getItemAsync(operationKey),
        original.exists ? original.text() : undefined,
        revision.exists ? revision.text() : undefined,
      ]);
      if (!active) return;

      if (savedOperation) setOperation(savedOperation);
      if (originalText !== undefined) {
        setJob({ state: 'COMPLETED', transcript: originalText });
        setDraft(revisedText ?? originalText);
      }
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
    return () => { active = false; };
  }, [operationKey]);

  async function request(config: Gateway, id: string, upload: boolean, signal?: AbortSignal) {
    const response = await fetch(`${config.url}/v1/jobs/${id}`, {
      method: upload ? 'PUT' : 'GET',
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(upload ? { 'Content-Type': 'audio/mp4' } : {}),
      },
      body: upload ? recording : undefined,
      signal,
    });
    if (!response.ok) throw new Error(response.status === 413
      ? 'This recording exceeds the Free upload limit.'
      : 'Could not reach or complete the transcription. Check the connection and retry.');
    const result: Job = await response.json();
    if (result.state === 'COMPLETED' && result.transcript) {
      if (!original.exists) await saveText(original, result.transcript);
      setDraft(revision.exists ? await revision.text() : result.transcript);
    }
    setJob(result);
    return result;
  }

  const complete = job?.state === 'COMPLETED';
  useEffect(() => {
    if (!gateway || !operation || busy || complete) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await request(gateway!, operation!, false, controller.signal);
        if (pending.has(result.state) && !controller.signal.aborted) timer = setTimeout(poll, 3000);
      } catch {
        if (!controller.signal.aborted) setMessage('Connection interrupted. Retry to resume this operation.');
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [gateway, operation, busy, complete]);


  async function connect() {
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
    if (!gateway || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const terminal = job && ['FAILED', 'CANCELLED', 'CLEANED', 'EXPIRED'].includes(job.state);
      const id = terminal ? randomUUID() : operation ?? randomUUID();
      await SecureStore.setItemAsync(operationKey, id);
      setOperation(id);
      setJob({ state: 'RESERVED' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      try {
        await request(gateway, id, true, controller.signal);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not submit the recording.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await saveText(revision, draft);
      setMessage('Revision saved on this device.');
    } catch {
      setMessage('Could not save the revision.');
    } finally {
      setBusy(false);
    }
  }

  const input = { color: palette.text, borderColor: palette.border, borderWidth: 1, padding: spacing.sm };
  return (
    <Modal onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Text accessibilityRole="header" style={[typography.heading, { color: palette.text }]}>Transcript</Text>
          {message ? <Text accessibilityLiveRegion="polite" style={{ color: palette.text }}>{message}</Text> : null}
          {complete ? (
            <>
              <Text style={{ color: palette.muted }}>Edge Speech · {showOriginal ? 'Original' : 'Editable revision'}</Text>
              <TextInput accessibilityLabel="Transcript text" multiline editable={!showOriginal}
                value={showOriginal ? job?.transcript : draft} onChangeText={setDraft}
                style={[input, { minHeight: 180, textAlignVertical: 'top' }]} />
              <Button title={showOriginal ? 'Show revision' : 'Show original'} onPress={() => setShowOriginal(!showOriginal)} />
              {!showOriginal ? <Button title="Save revision" disabled={busy} onPress={save} /> : null}
            </>
          ) : gateway ? (
            <>
              <Text style={{ color: palette.text }}>Transcription sends this recording to your private Edge Speech gateway.</Text>
              {job ? <Text style={{ color: palette.text }}>{stateLabels[job.state] ?? job.state}</Text> : null}
              {busy ? <ActivityIndicator accessibilityLabel="Submitting recording" /> : null}
              <Button title={job && ['FAILED', 'CANCELLED', 'CLEANED', 'EXPIRED'].includes(job.state) ? 'Start new transcription' : operation ? 'Retry or resume' : 'Transcribe'} disabled={busy} onPress={submit} />
            </>
          ) : (
            <View style={{ gap: spacing.md }}>
              {process.env.EXPO_PUBLIC_RECORDER_GATEWAY_URL ? null : <>
              <TextInput accessibilityLabel="Gateway URL" placeholder="https://…" autoCapitalize="none" value={url} onChangeText={setUrl} style={input} />
              <TextInput accessibilityLabel="Pilot access token" placeholder="Pilot access token" secureTextEntry autoCapitalize="none" value={token} onChangeText={setToken} style={input} />
              </>}
              <Button title={connecting ? "Connecting…" : "Connect"} disabled={connecting} onPress={connect} />
            </View>
          )}
          <Button title="Back to recordings" onPress={onClose} disabled={busy} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
