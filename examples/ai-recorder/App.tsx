import { useEffect, useReducer, useRef, useState } from 'react';
import { BackHandler, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  RecordingPresets,
  requestNotificationPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Host, Slider } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics } from '@expo/ui/jetpack-compose/modifiers';
import { Transcript } from './Transcript';
import { ProSettings } from './ProSettings';
import { AppHeader, RootNavigation } from './ui/AppChrome';
import { ActionButton } from './ui/ActionButton';
import { RecordControl } from './ui/RecordControl.android';
import { handoffReducer, initialHandoff, locateRecording } from './ui/libraryHandoff';
import { canSwitchDestination, type CapturePhase, type RootDestination } from './ui/navigation';
import { ThemeProvider, useTheme } from './ui/theme';
import { selectedService } from './ProAccess';
import { services } from './ServiceConfig';
import { Directory, File, Paths } from 'expo-file-system';
import { getDocumentAsync } from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';

const recordings = new Directory(Paths.document, 'recordings');

function listRecordings() {
  if (!recordings.exists) return [];
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

function formatTime(time: number) {
  const seconds = Math.floor(time);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function RecorderScreen() {
  const { palette, spacing, typography } = useTheme();
  const [destination, setDestination] = useState<RootDestination>('record');
  const [showPro, setShowPro] = useState(false);
  const [files, setFiles] = useState(listRecordings);
  const [phase, setPhase] = useState<CapturePhase>('idle');
  // Native callbacks can arrive before React commits a disabled button.
  const phaseRef = useRef<CapturePhase>('idle');
  function setCapturePhase(next: CapturePhase) { phaseRef.current = next; setPhase(next); }
  const activeCapture = useRef(false);
  const finishedUrls = useRef(new Set<string>());
  const playRequest = useRef(0);
  const [handoff, dispatchHandoff] = useReducer(handoffReducer, initialHandoff);
  const library = useRef<FlatList<File>>(null);
  const [libraryReady, setLibraryReady] = useState(false);
  const visibleUris = useRef(new Set<string>());
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item: File }[] }) => {
    visibleUris.current = new Set(viewableItems.map(token => token.item.uri));
  }).current;
  const [message, setMessage] = useState('');
  const [serviceLabel, setServiceLabel] = useState<string>(services.staging.label);
  const player = useAudioPlayer();
  const playback = useAudioPlayerStatus(player);
  const [transcriptRecording, setTranscriptRecording] = useState<File>();
  const [playingFile, setPlayingFile] = useState<string>();
  const [seekPosition, setSeekPosition] = useState<number>();
  const pendingSeek = useRef<number>(undefined);
  const position = Math.min(seekPosition ?? playback.currentTime, playback.duration);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, async (status) => {
    if (!status.isFinished || !activeCapture.current || (status.url && finishedUrls.current.has(status.url))) return;
    activeCapture.current = false;
    if (status.url) finishedUrls.current.add(status.url);
    setCapturePhase('saving');
    try {
      if (status.hasError || !status.url) throw new Error('Recording did not finish.');
      const source = new File(status.url);
      if (!source.exists || !source.size) throw new Error('Recording file is empty.');
      recordings.create({ idempotent: true });
      const saved = new File(recordings, `Recording-${Date.now()}-${source.name}`);
      await source.move(saved);
      setFiles(listRecordings());
      dispatchHandoff({ type: 'saved', uri: saved.uri });
      setMessage('Recording saved on this device.');
    } catch {
      dispatchHandoff({ type: 'reset' });
      setMessage('Could not save the recording.');
    } finally {
      setCapturePhase('idle');
    }
  });
  const { durationMillis } = useAudioRecorderState(recorder, 500);

  useEffect(() => {
    let current = true;
    void selectedService().then(id => { if (current) setServiceLabel(services[id].label); }).catch(() => {});
    return () => { current = false; };
  }, [showPro]);

  function navigate(next: RootDestination) {
    if (!canSwitchDestination(phaseRef.current) || next === destination) return;
    dispatchHandoff({ type: 'leave' });
    visibleUris.current.clear();
    setLibraryReady(false);
    setDestination(next);
    setMessage('');
  }

  function viewSavedRecording() {
    if (phaseRef.current !== 'idle' || !handoff.savedUri) return;
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
    if (destination !== 'library' || !libraryReady || !request || request.located) return;
    return locateRecording(() => {
      const index = files.findIndex(file => file.uri === request.uri);
      if (index < 0) return false;
      library.current?.scrollToIndex({ index, animated: false, viewPosition: 0 });
      if (!visibleUris.current.has(request.uri)) return false;
      dispatchHandoff({ type: 'located', id: request.id });
      return true;
    }, () => {
      dispatchHandoff({ type: 'expire', id: request.id });
      setMessage('Find your saved recording by its date and time in Library.');
    });
  }, [destination, libraryReady, files, handoff.request]);

  useEffect(() => {
    const request = handoff.request;
    if (!request?.located) return;
    const timer = setTimeout(() => dispatchHandoff({ type: 'expire', id: request.id }), 5000);
    return () => clearTimeout(timer);
  }, [handoff.request]);


  async function importAudio() {
    if (phaseRef.current !== 'idle') return;
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

  async function start() {
    if (phaseRef.current !== 'idle') return;
    setCapturePhase('starting');
    dispatchHandoff({ type: 'reset' });
    ++playRequest.current;
    setMessage('');
    try {
      if (!(await requestRecordingPermissionsAsync()).granted) {
        setMessage('Allow microphone access to record.');
        setCapturePhase('idle');
        return;
      }
      await requestNotificationPermissionsAsync();
      player.pause();
      await setAudioModeAsync({ allowsRecording: true, allowsBackgroundRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      activeCapture.current = true;
      recorder.record();
      setCapturePhase('recording');
    } catch {
      activeCapture.current = false;
      setMessage('Could not start recording. Return to the app and try again.');
      setCapturePhase('idle');
    }
  }

  async function stop() {
    if (phaseRef.current !== 'recording') return;
    setCapturePhase('saving');
    try {
      await recorder.stop();
    } catch {
      setMessage('Could not stop the recording.');
      setCapturePhase(recorder.getStatus().isRecording ? 'recording' : 'idle');
    }
  }

  async function togglePlayback(file: File) {
    if (phaseRef.current !== 'idle') return;
    const request = ++playRequest.current;
    try {
      if (playingFile === file.uri) {
        if (player.playing) {
          player.pause();
          return;
        }
        if (player.duration > 0 && player.currentTime >= player.duration) {
          await player.seekTo(0);
        }
      } else {
        player.pause();
        pendingSeek.current = undefined;
        setSeekPosition(undefined);
        player.replace(file.uri);
        setPlayingFile(file.uri);
      }
      if (request === playRequest.current && phaseRef.current === 'idle') player.play();
    } catch {
      setMessage('Could not play the recording.');
    }
  }

  async function finishSeek() {
    if (phaseRef.current !== 'idle') return;
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

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: palette.background }}>
      <AppHeader title={{ record: 'Record', library: 'Library', settings: 'Settings' }[destination]} />
      {showPro ? <ProSettings onClose={() => setShowPro(false)} /> : null}
      {transcriptRecording ? <Transcript recording={transcriptRecording} recordingTitle={recordingLabel(transcriptRecording)} onClose={() => setTranscriptRecording(undefined)} /> : null}
      {phase === 'recording' && destination !== 'record' ? <View style={styles.recordingBanner}>
        <View style={{ flex: 1 }}>
          <Text accessibilityLiveRegion="polite" style={{ color: palette.text, fontWeight: '700' }}>Recording · {formatTime(durationMillis / 1000)}</Text>
        </View>
        <ActionButton title="Return" fullWidth={false} variant="text" onPress={() => navigate('record')} />
      </View> : null}
      {message && destination !== 'record' ? <View style={styles.notice}>
        <Text accessibilityLiveRegion="polite" style={{ color: palette.text }}>{message}</Text>
        {handoff.savedUri && phase === 'idle' ? <ActionButton title="View in Library" variant="text"
          fullWidth={false} onPress={viewSavedRecording} /> : null}
      </View> : null}
      {destination === 'record' ? <ScrollView style={{ flex: 1 }} contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.xxl }}>
        <View style={{ alignItems: 'center', gap: spacing.xl }}>
          <Text accessibilityLiveRegion="polite" style={[typography.heading, { color: palette.text, textAlign: 'center' }]}>
            {phase === 'recording' ? 'Recording' : phase === 'starting' ? 'Starting…' : phase === 'saving' ? 'Saving…' : message || 'Ready to record'}
          </Text>
          {phase === 'recording' ? <>
            <Text selectable accessibilityLabel={`Recording duration ${formatTime(durationMillis / 1000)}`}
              style={styles.timer}>{formatTime(durationMillis / 1000)}</Text>
            {message ? <Text accessibilityLiveRegion="polite" style={[styles.copy, { textAlign: 'center' }]}>{message}</Text> : null}
          </> : null}
          {handoff.savedUri && phase === 'idle' ? <ActionButton title="View in Library" variant="text"
            fullWidth={false} onPress={viewSavedRecording} /> : null}
          <RecordControl phase={phase} onPress={phase === 'recording' ? stop : start} />
          {!(handoff.savedUri && phase === 'idle') ? <Text style={[styles.support, { textAlign: 'center' }]}>
            Recordings are stored on this device.
          </Text> : null}
        </View>
      </ScrollView> : destination === 'settings' ? <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Text accessibilityRole="header" style={[typography.title, { color: palette.text }]}>Services and access</Text>
        <Text style={styles.copy}>Recordings and saved results stay on this device. Services are used only when you request transcription or a summary.</Text>
        <View style={styles.valueCard}>
          <Text style={styles.cardTitle}>Transcription service</Text>
          <Text style={styles.support}>{serviceLabel}</Text>
          <Text style={styles.support}>Choose the service for new transcriptions. Existing jobs keep the service they started with.</Text>
          <ActionButton title="Choose service and manage keys" variant="primary" disabled={phase !== 'idle'} onPress={() => setShowPro(true)} />
        </View>
      </ScrollView> : <View style={{ flex: 1, paddingHorizontal: spacing.lg, gap: spacing.md }}>
      <ActionButton title={phase === 'importing' ? 'Importing…' : 'Import audio'} fullWidth={false}
        disabled={phase !== 'idle'} variant="text" onPress={importAudio} />
      <FlatList
        ref={library}
        onLayout={() => setLibraryReady(true)}
        onViewableItemsChanged={onViewableItemsChanged}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          library.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
        }}
        data={files}
        keyExtractor={(file) => file.uri}
        ListEmptyComponent={<View style={styles.emptyState}>
          <Text style={styles.cardTitle}>Your recordings live here</Text>
          <Text style={styles.support}>Make a recording or import an M4A file. Playback and transcript choices stay on this device.</Text>
        </View>}
        extraData={{ playback, handoff }}
        renderItem={({ item }) => {
          const selected = playingFile === item.uri;
          const action = selected && playback.playing ? 'Pause' : 'Play';
          const label = recordingLabel(item);
          const highlighted = handoff.request?.located && handoff.request.uri === item.uri;
          return (
            <View style={[styles.recordingCard, { backgroundColor: palette.background,
              borderColor: highlighted ? palette.accent : palette.border,
              borderWidth: highlighted ? 2 : 0 }]}>
              {highlighted ? <Text accessibilityLiveRegion="polite" style={{ color: palette.accent, fontWeight: '600' }}>Newly saved recording</Text> : null}
              <View style={styles.row}>
                <Text style={[styles.filename, { color: palette.text, fontWeight: '600' }]}>{label}</Text>
                <ActionButton
                  fullWidth={false}
                  variant="text"
                  title={action}
                  accessibilityLabel={`${action} ${label}`}
                  disabled={phase !== 'idle'}
                  onPress={() => togglePlayback(item)}
                />
              </View>
              {selected && playback.isLoaded && playback.duration > 0 ? (
                <>
                  <Host matchContents={{ vertical: true }} style={styles.slider}>
                    <Slider
                      max={playback.duration}
                      value={position}
                      enabled={phase === 'idle'}
                      modifiers={[fillMaxWidth(), semantics({ contentDescription: `Playback position for ${label}` })]}
                      onValueChange={(value) => {
                        pendingSeek.current = value;
                        setSeekPosition(value);
                      }}
                      onValueChangeFinished={finishSeek}
                    />
                  </Host>
                  <View style={styles.times}>
                    <Text style={styles.filename}>{formatTime(position)}</Text>
                    <Text style={styles.copy}>{formatTime(playback.duration)}</Text>
                  </View>
                </>
              ) : null}
              <ActionButton title="Transcript" fullWidth={false} accessibilityLabel={`Transcript for ${label}`} variant="text"
                disabled={phase !== 'idle'} onPress={() => {
                  if (phaseRef.current !== 'idle') return;
                  ++playRequest.current;
                  player.pause(); dispatchHandoff({ type: 'leave' }); setTranscriptRecording(item);
                }} />
            </View>
          );
        }}
      />
      </View>}
      <RootNavigation selected={destination} onSelect={navigate} enabled={canSwitchDestination(phase)} />
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><ThemeProvider><RecorderScreen /></ThemeProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  copy: { fontSize: 16, lineHeight: 24, color: '#49454F' },
  support: { fontSize: 14, lineHeight: 21, color: '#49454F' },
  filename: { flex: 1, fontSize: 15, color: '#1D1B20' },
  cardTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600', color: '#1D1B20' },
  valueCard: { padding: 20, gap: 12, borderRadius: 24, backgroundColor: '#F3EDF7' },
  timer: { fontSize: 48, lineHeight: 56, fontVariant: ['tabular-nums'], fontWeight: '500', color: '#1D1B20' },
  emptyState: { gap: 10, paddingTop: 28, paddingBottom: 16 },
  recordingCard: { padding: 16, marginBottom: 12, gap: 10, borderRadius: 20, backgroundColor: '#F3EDF7' },
  recordingBanner: { paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F3EDF7' },
  notice: { padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  slider: { width: '100%' },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
});
