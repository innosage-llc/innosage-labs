import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { BackHandler, Platform, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorderState,
} from 'expo-audio';
import { Transcript } from './Transcript';
import { recordingDurationMillis } from './NativeUpload';
import { ProSettings } from './ProSettings';
import { RootShell } from './ui/RootShell';
import { ActionButton } from './ui/ActionButton';
import { LibraryView, type LibraryViewHandle } from './ui/library-view';
import { RecordView } from './ui/record-view';
import { RecordingDetail } from './ui/recording-detail';
import type { RecordingDocumentDestination } from './savedRecordingDocuments';
import { formatRecordingTime, recordingDate, recordingTimeLabel, type RecordingSummary } from './ui/recording-display';
import { shareRecording } from './recordingShare';
import { handoffReducer, initialHandoff, locateRecording } from './ui/libraryHandoff';
import { hasSavedFeedback } from './ui/recordFeedback';
import { canSwitchDestination, type RootDestination } from './ui/navigation';
import { ThemeProvider, useTheme } from './ui/theme';
import { selectedService } from './ProAccess';
import { services } from './ServiceConfig';
import { Directory, File, Paths } from 'expo-file-system';
import { getDocumentAsync } from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import { getCaptureSession } from './captureOwner';

// Web launch/navigation is supported; native filesystem capture/import is not.
// Never construct the native Directory at Web module initialization.
const recordings = Platform.OS === 'web' ? undefined : new Directory(Paths.document, 'recordings');

function listRecordings() {
  if (!recordings?.exists) return [];
  return recordings.list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.m4a'))
    .sort((a, b) => Number(b.name.split('-')[1]) - Number(a.name.split('-')[1]));
}

function recordingLabel(file: File) {
  if (file.name.startsWith('Import-')) {
    try {
      return new File(file.parentDirectory, file.name + '.name').textSync();
    } catch {
      return 'Imported audio';
    }
  }
  return new Date(Number(file.name.split('-')[1])).toLocaleString();
}

function summarizeRecordings(files: File[]): RecordingSummary[] {
  const minutes = new Map<string, number>();
  const seconds = new Map<string, number>();
  const recordings = files.map(file => {
    const createdAt = Number(file.name.split('-')[1]);
    const date = recordingDate(createdAt);
    if (!date || file.name.startsWith('Import-')) return { kind: 'file' as const, file, createdAt };
    const shortTime = recordingTimeLabel(date, 'minute');
    const longTime = recordingTimeLabel(date, 'second');
    const day = date.toDateString();
    const minuteKey = `${day} ${shortTime}`;
    const secondKey = `${day} ${longTime}`;
    minutes.set(minuteKey, (minutes.get(minuteKey) ?? 0) + 1);
    seconds.set(secondKey, (seconds.get(secondKey) ?? 0) + 1);
    return { kind: 'time' as const, file, createdAt, date, shortTime, longTime, minuteKey, secondKey };
  });
  return recordings.map(recording => {
    const { file, createdAt } = recording;
    if (recording.kind === 'file') {
      const label = file.name.startsWith('Import-') ? recordingLabel(file) : file.name;
      return { uri: file.uri, label, createdAt };
    }
    const { date, shortTime, longTime, minuteKey, secondKey } = recording;
    let label = (minutes.get(minuteKey) ?? 0) > 1 ? longTime : shortTime;
    if ((seconds.get(secondKey) ?? 0) > 1) {
      label = recordingTimeLabel(date, 'millisecond');
    }
    return { uri: file.uri, label, createdAt };
  });
}

function RecorderScreen() {
  const { palette, spacing, typography } = useTheme();
  const [destination, setDestination] = useState<RootDestination>('record');
  const [showPro, setShowPro] = useState(false);
  const [files, setFiles] = useState(listRecordings);
  const [recordingDurations, setRecordingDurations] = useState(() => new Map<string, number | undefined>());
  const durationRequests = useRef(new Map<string, Promise<number | undefined>>());
  const fileSummaries = useMemo(() => summarizeRecordings(files), [files]);
  const summaries = useMemo(() => fileSummaries.map(summary => {
    const durationSeconds = recordingDurations.get(summary.uri);
    return durationSeconds === undefined ? summary : { ...summary, durationSeconds };
  }), [fileSummaries, recordingDurations]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const pending = files.filter(file => !recordingDurations.has(file.uri));
    if (!pending.length) return;
    const requests = durationRequests.current;
    let current = true;
    async function readDurations() {
      // Use the local metadata reader so opening Library leaves playback idle.
      const resolved = new Map(recordingDurations);
      for (const file of pending) {
        let request = requests.get(file.uri);
        if (!request) {
          request = recordingDurationMillis(file).catch(() => undefined);
          requests.set(file.uri, request);
        }
        const millis = await request;
        if (!current) return;
        resolved.set(file.uri, millis === undefined ? undefined : millis / 1000);
      }
      setRecordingDurations(resolved);
    }
    void readDurations();
    return () => { current = false; };
  }, [files, recordingDurations]);
  const session = getCaptureSession();
  const capture = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => {
    let current = true;
    void session.ready.then(() => { if (current) setFiles(listRecordings()); });
    return () => { current = false; };
  }, [session]);
  const { phase, message } = capture;
  const setCapturePhase = session.setPhase;
  const setMessage = session.setMessage;
  const playRequest = useRef(0);
  const sharing = useRef(false);
  const [sharePending, setSharePending] = useState(false);
  const [handoff, dispatchHandoff] = useReducer(handoffReducer, initialHandoff);
  const library = useRef<LibraryViewHandle>(null);
  const [serviceLabel, setServiceLabel] = useState<string>(services.staging.label);
  const player = useAudioPlayer();
  const playback = useAudioPlayerStatus(player);
  // Clear before the old player's deferred release; old cleanup cannot clear a newer binding.
  useLayoutEffect(() => session.bindPlayback(() => player.pause()), [session, player]);
  const [transcriptRoute, setTranscriptRoute] = useState<{ file: File; destination: RecordingDocumentDestination }>();
  const [detailUri, setDetailUri] = useState<string>();
  const detailRecording = summaries.find(recording => recording.uri === detailUri);
  const detailFile = files.find(file => file.uri === detailUri);
  const [playingFile, setPlayingFile] = useState<string>();
  const androidPlayRequested = useRef<{ status: typeof playback; deadline: number } | undefined>(undefined);
  const [androidPlayPending, setAndroidPlayPending] = useState(false);
  const [seekPosition, setSeekPosition] = useState<number>();
  const pendingSeek = useRef<number>(undefined);
  const position = Math.min(seekPosition ?? playback.currentTime, playback.duration);
  const playbackError = (playback as typeof playback & { error?: string | null }).error;
  useEffect(() => {
    if (Platform.OS !== 'android' || !detailUri || detailUri !== playingFile) return;
    if (playbackError) {
      ++playRequest.current;
      androidPlayRequested.current = undefined;
      setAndroidPlayPending(false);
      player.pause();
      setPlayingFile(undefined);
      setMessage('Could not play the recording.');
      return;
    }
    const pending = androidPlayRequested.current;
    if (!androidPlayPending || !pending) return;
    if (playback.playing || (playback.didJustFinish && playback !== pending.status)) {
      androidPlayRequested.current = undefined;
      setAndroidPlayPending(false);
      return;
    }
    // A refused native audio-focus request can return without a status event.
    const timeout = setTimeout(() => {
      if (androidPlayRequested.current !== pending) return;
      ++playRequest.current;
      androidPlayRequested.current = undefined;
      setAndroidPlayPending(false);
      player.pause();
      setMessage('Playback did not start. Try again.');
    }, Math.max(0, pending.deadline - Date.now()));
    return () => clearTimeout(timeout);
  }, [androidPlayPending, detailUri, player, playingFile, playback, playbackError, setMessage]);
  const recorder = session.recorder;
  useEffect(() => {
    if (!capture.savedUri) return;
    setFiles(listRecordings());
    dispatchHandoff({ type: 'saved', uri: capture.savedUri });
  }, [capture.savedUri, capture.saveVersion]);
  const { durationMillis } = useAudioRecorderState(recorder, 500);

  useEffect(() => {
    let current = true;
    void selectedService().then(id => { if (current) setServiceLabel(services[id].label); }).catch(() => {});
    return () => { current = false; };
  }, [showPro]);

  function navigate(next: RootDestination) {
    if (!canSwitchDestination(session.getSnapshot().phase) || next === destination) return;
    dispatchHandoff({ type: 'leave' });
    setDetailUri(undefined);
    setDestination(next);
    setMessage('');
  }

  function openRecording(uri: string) {
    if (session.getSnapshot().phase !== 'idle') return;
    const file = files.find(file => file.uri === uri && file.exists);
    if (!file) {
      setFiles(listRecordings());
      setMessage('This recording is no longer available on this device.');
      return;
    }
    dispatchHandoff({ type: 'leave' });
    setMessage('');
    setDetailUri(uri);
    if (Platform.OS === 'android' && playingFile !== uri) {
      ++playRequest.current;
      try {
        preparePlayback(file);
      } catch {
        setMessage('Could not load the recording.');
      }
    }
  }

  function closeRecording() {
    ++playRequest.current;
    pausePlayback();
    pendingSeek.current = undefined;
    setSeekPosition(undefined);
    setDetailUri(undefined);
    setMessage('');
  }

  function openTranscript(file: File, destination: RecordingDocumentDestination = 'transcript') {
    if (session.getSnapshot().phase !== 'idle') return;
    ++playRequest.current;
    pausePlayback();
    setMessage('');
    setTranscriptRoute({ file, destination });
  }

  function viewSavedRecording() {
    if (session.getSnapshot().phase !== 'idle' || !handoff.savedUri) return;
    if (!files.some(file => file.uri === handoff.savedUri && file.exists)) {
      dispatchHandoff({ type: 'reset' });
      setMessage('This recording is no longer available on this device.');
      return;
    }
    dispatchHandoff({ type: 'view' });
    setMessage('');
    setDestination('library');
  }

  useEffect(() => {
    const request = handoff.request;
    if (destination !== 'library' || !request || request.located) return;
    return locateRecording(() => {
      if (!library.current?.locateRecording(request.uri)) return false;
      dispatchHandoff({ type: 'located', id: request.id });
      return true;
    }, () => {
      dispatchHandoff({ type: 'expire', id: request.id });
      setMessage('Find your saved recording by its date and time in Library.');
    });
  }, [destination, summaries, handoff.request]);

  useEffect(() => {
    const request = handoff.request;
    if (!request?.located) return;
    const timer = setTimeout(() => dispatchHandoff({ type: 'expire', id: request.id }), 5000);
    return () => clearTimeout(timer);
  }, [handoff.request]);


  async function importAudio() {
    if (!recordings) return;
    if (session.getSnapshot().phase !== 'idle') return;
    setCapturePhase('importing');
    dispatchHandoff({ type: 'reset' });
    setMessage('');
    let cached: File | undefined;
    let label: File | undefined;
    let imported = false;
    try {
      const selection = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (selection.canceled) return;
      const asset = selection.assets[0];
      cached = new File(asset.uri);
      if (!asset.name.toLowerCase().endsWith('.m4a')) {
        setMessage('Choose an M4A audio file.');
        return;
      }
      if (!cached.exists || !cached.size) {
        setMessage('The selected audio file is empty or unavailable.');
        return;
      }
      recordings.create({ idempotent: true });
      const name = `Import-${Date.now()}-${randomUUID()}.m4a`;
      label = new File(recordings, name + '.name');
      await label.write(asset.name);
      await cached.move(new File(recordings, name));
      cached = undefined;
      imported = true;
      setFiles(listRecordings());
      setMessage('Audio imported to this device.');
    } catch {
      setMessage('Could not import the audio. Check available storage and try again.');
    } finally {
      try {
        if (cached?.exists) cached.delete();
        if (!imported && label?.exists) label.delete();
      } catch {
        // A cache cleanup failure must not leave the import controls disabled.
      }
      setCapturePhase('idle');
    }
  }

  async function shareAudio(file: File, label: string) {
    if (!recordings || sharing.current || session.getSnapshot().phase !== 'idle') return;
    sharing.current = true;
    setSharePending(true);
    setMessage('');
    try {
      const result = await shareRecording(file, label);
      if (result === 'missing') setMessage('This recording is unavailable on this device.');
      if (result === 'unavailable') setMessage('Audio sharing is unavailable on this device.');
      if (result === 'no-space') setMessage('Free up storage to share a copy of this recording.');
      if (result === 'failed') setMessage('Could not share the audio. Check available storage and try again.');
    } finally {
      sharing.current = false;
      setSharePending(false);
    }
  }

  async function start() {
    if (session.getSnapshot().phase !== 'idle') return;
    dispatchHandoff({ type: 'reset' });
    ++playRequest.current;
    cancelAndroidPlayRequest();
    await session.start();
  }

  async function stop() {
    await session.stop();
  }

  function cancelAndroidPlayRequest() {
    androidPlayRequested.current = undefined;
    setAndroidPlayPending(false);
  }

  function pausePlayback() {
    cancelAndroidPlayRequest();
    player.pause();
  }

  function preparePlayback(file: File) {
    pausePlayback();
    pendingSeek.current = undefined;
    setSeekPosition(undefined);
    player.replace(file.uri);
    setPlayingFile(file.uri);
  }

  async function togglePlayback(file: File) {
    if (session.getSnapshot().phase !== 'idle') return;
    const request = ++playRequest.current;
    try {
      if (playingFile === file.uri) {
        const shouldPause = Platform.OS === 'android'
          ? androidPlayRequested.current || playback.playing : player.playing;
        if (shouldPause) {
          pausePlayback();
          return;
        }
      } else {
        preparePlayback(file);
      }
      if (Platform.OS === 'android') {
        // Native can defer Play until focus is granted. A second tap cancels that request.
        androidPlayRequested.current = { status: playback, deadline: Date.now() + 5000 };
        setAndroidPlayPending(true);
      }
      if (playingFile === file.uri && player.duration > 0 && player.currentTime >= player.duration) {
        await player.seekTo(0);
      }
      if (request !== playRequest.current || session.getSnapshot().phase !== 'idle') return;
      player.play();
    } catch {
      if (request !== playRequest.current) return;
      cancelAndroidPlayRequest();
      setMessage('Could not play the recording.');
    }
  }

  async function finishSeek() {
    if (session.getSnapshot().phase !== 'idle') return;
    const target = pendingSeek.current;
    if (target === undefined) return;
    pendingSeek.current = undefined;
    try {
      await player.seekTo(target);
    } catch {
      setMessage('Could not seek in the recording.');
    } finally {
      if (pendingSeek.current === undefined) setSeekPosition(undefined);
    }
  }

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canSwitchDestination(phase)) return true;
      if (destination === 'record') return false;
      navigate('record');
      return true;
    });
    return () => subscription.remove();
  }, [destination, phase]);

  const showSavedFeedback = hasSavedFeedback(phase, handoff.savedUri, message);
  const detailOwnsPlayer = detailUri !== undefined && playingFile === detailUri;

  return (
    <RootShell selected={destination} onSelect={navigate} enabled={canSwitchDestination(phase)}
      libraryImport={{ importing: phase === 'importing', disabled: phase !== 'idle' || !recordings, onPress: importAudio }}>
      {detailRecording && detailFile && !transcriptRoute ? <RecordingDetail
        key={detailUri}
        recording={detailRecording}
        file={detailFile}
        playing={detailOwnsPlayer && (playback.playing || androidPlayPending)}
        disabled={phase !== 'idle'}
        shareDisabled={sharePending}
        message={message}
        onBack={closeRecording}
        onTogglePlayback={() => { void togglePlayback(detailFile); }}
        onShare={() => { void shareAudio(detailFile, recordingLabel(detailFile)); }}
        onTranscript={() => openTranscript(detailFile)}
        onSummary={() => openTranscript(detailFile, 'summary')}
        seek={detailOwnsPlayer && playback.isLoaded && playback.duration > 0 ? {
          max: playback.duration,
          value: position,
          onValueChange: value => {
            pendingSeek.current = value;
            setSeekPosition(value);
          },
          onValueChangeFinished: finishSeek,
        } : undefined}
      /> : null}
      {showPro ? <ProSettings onClose={() => setShowPro(false)} /> : null}
      {transcriptRoute ? <Transcript recording={transcriptRoute.file} recordingTitle={recordingLabel(transcriptRoute.file)}
        initialDocument={transcriptRoute.destination}
        backLabel="Back to recording details" onClose={() => setTranscriptRoute(undefined)} /> : null}
      {phase === 'recording' && destination !== 'record' ? <View style={[styles.recordingBanner, { backgroundColor: palette.surface }]}>
        <View style={{ flex: 1 }}>
          <Text accessibilityLiveRegion="polite" style={{ color: palette.text, fontWeight: '700' }}>Recording · {formatRecordingTime(durationMillis / 1000)}</Text>
        </View>
        <ActionButton title="Return" fullWidth={false} variant="text" onPress={() => navigate('record')} />
      </View> : null}
      {message && destination !== 'record' && !detailRecording ? <View style={styles.notice}>
        <Text accessibilityLiveRegion="polite" style={{ color: palette.text }}>{message}</Text>
        {showSavedFeedback ? <ActionButton title="View in Library" variant="text"
          fullWidth={false} onPress={viewSavedRecording} /> : null}
      </View> : null}
      {destination === 'record' ? <RecordView
        phase={phase}
        message={message}
        durationMillis={durationMillis}
        savedUri={handoff.savedUri}
        onPressRecord={phase === 'recording' ? stop : start}
        onViewInLibrary={viewSavedRecording}
      /> : destination === 'settings' ? <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Text accessibilityRole="header" style={[typography.title, { color: palette.text }]}>Services and access</Text>
        <Text style={[styles.copy, { color: palette.muted }]}>Recordings and saved results stay on this device. Services are used only when you request transcription or a summary.</Text>
        <View style={[styles.valueCard, { backgroundColor: palette.surface }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>Transcription service</Text>
          <Text style={[styles.support, { color: palette.muted }]}>{serviceLabel}</Text>
          <Text style={[styles.support, { color: palette.muted }]}>Choose the service for new transcriptions. Existing jobs keep the service they started with.</Text>
          <ActionButton title="Choose service and manage keys" variant="primary" disabled={phase !== 'idle'} onPress={() => setShowPro(true)} />
        </View>
      </ScrollView> : <LibraryView
        ref={library}
        recordings={summaries}
        phase={phase}
        highlightedUri={handoff.request?.located ? handoff.request.uri : undefined}
        onOpenRecording={openRecording}
      />}
    </RootShell>
  );
}

export default function App() {
  const scheme = useColorScheme();
  const mode = Platform.OS === 'android' && scheme === 'dark' ? 'dark' : 'light';
  return <SafeAreaProvider><ThemeProvider mode={mode}><RecorderScreen /></ThemeProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  copy: { fontSize: 16, lineHeight: 24 },
  support: { fontSize: 14, lineHeight: 21 },
  cardTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  valueCard: { padding: 20, gap: 12, borderRadius: 24 },
  recordingBanner: { paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  notice: { padding: 16, gap: 8 },
});
