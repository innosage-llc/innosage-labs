import { useEffect, useRef, useState } from 'react';
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
    if (!status.isFinished) return;
    try {
      if (status.hasError || !status.url) throw new Error('Recording did not finish.');
      const source = new File(status.url);
      if (!source.exists || !source.size) throw new Error('Recording file is empty.');
      recordings.create({ idempotent: true });
      await source.move(new File(recordings, `Recording-${Date.now()}-${source.name}`));
      setFiles(listRecordings());
      setMessage('Recording saved on this device.');
    } catch {
      setMessage('Could not save the recording.');
    } finally {
      setPhase('idle');
    }
  });
  const { durationMillis } = useAudioRecorderState(recorder, 500);

  useEffect(() => {
    let current = true;
    void selectedService().then(id => { if (current) setServiceLabel(services[id].label); }).catch(() => {});
    return () => { current = false; };
  }, [showPro]);


  async function importAudio() {
    setPhase('importing');
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
      setPhase('idle');
    }
  }

  async function start() {
    setPhase('starting');
    setMessage('');
    try {
      if (!(await requestRecordingPermissionsAsync()).granted) {
        setMessage('Allow microphone access to record.');
        setPhase('idle');
        return;
      }
      await requestNotificationPermissionsAsync();
      player.pause();
      await setAudioModeAsync({ allowsRecording: true, allowsBackgroundRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch {
      setMessage('Could not start recording. Return to the app and try again.');
      setPhase('idle');
    }
  }

  async function stop() {
    setPhase('saving');
    try {
      await recorder.stop();
    } catch {
      setMessage('Could not stop the recording.');
      setPhase(recorder.getStatus().isRecording ? 'recording' : 'idle');
    }
  }

  async function togglePlayback(file: File) {
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
      player.play();
    } catch {
      setMessage('Could not play the recording.');
    }
  }

  async function finishSeek() {
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
      setDestination('record');
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
          <Text style={styles.support}>Your audio is staying on this device.</Text>
        </View>
        <ActionButton title="Return" fullWidth={false} variant="text" onPress={() => setDestination('record')} />
      </View> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text> : null}
      {destination === 'record' ? <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Text accessibilityRole="header" style={[typography.title, { color: palette.text }]}>
          {phase === 'recording' ? 'Your recording is in progress.' : 'Keep the thought. Even without internet.'}
        </Text>
        <Text style={styles.copy}>Recordings stay on this device. Nothing is uploaded until you choose to transcribe.</Text>
        {phase === 'recording' ? <View style={styles.timerCard}>
          <Text style={[typography.caption, { color: palette.muted }]}>RECORDING</Text>
          <Text accessibilityLiveRegion="polite" style={styles.timer}>{formatTime(durationMillis / 1000)}</Text>
          <Text style={styles.support}>Keep recording with the screen locked.</Text>
        </View> : <View style={styles.valueCard}>
          <Text style={styles.cardTitle}>Made for the moment</Text>
          <Text style={styles.support}>Capture now. Choose later if you want a transcript or summary.</Text>
        </View>}
        <ActionButton
          title={{ idle: 'Start recording', starting: 'Starting…', recording: 'Stop & save', saving: 'Saving…', importing: 'Start recording' }[phase]}
          variant={phase === 'recording' ? 'outlined' : 'primary'}
          disabled={phase !== 'idle' && phase !== 'recording'}
          onPress={phase === 'recording' ? stop : start}
        />
        <Text style={styles.support}>Offline first · No account needed to record</Text>
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
      <ActionButton title={phase === 'importing' ? 'Importing…' : 'Import audio'} disabled={phase !== 'idle'} variant="primary" onPress={importAudio} />
      <FlatList
        data={files}
        keyExtractor={(file) => file.uri}
        ListEmptyComponent={<View style={styles.emptyState}>
          <Text style={styles.cardTitle}>Your recordings live here</Text>
          <Text style={styles.support}>Make a recording or import an M4A file. Playback and transcript choices stay on this device.</Text>
        </View>}
        extraData={playback}
        renderItem={({ item }) => {
          const selected = playingFile === item.uri;
          const action = selected && playback.playing ? 'Pause' : 'Play';
          const label = recordingLabel(item);
          return (
            <View style={styles.recordingCard}>
              <View style={styles.row}>
                <Text style={styles.filename}>{label} · M4A</Text>
                <ActionButton
                  fullWidth={false}
                  variant="text"
                  title={action}
                  accessibilityLabel={`${action} ${label}`}
                  disabled={phase !== 'idle'}
                  onPress={() => togglePlayback(item)}
                />
              </View>
              <ActionButton title="Transcript" accessibilityLabel={`Transcript for ${label}`} variant="outlined"
                disabled={phase !== 'idle'} onPress={() => { player.pause(); setTranscriptRecording(item); }} />
              {selected && playback.isLoaded && playback.duration > 0 ? (
                <>
                  <Host matchContents={{ vertical: true }} style={styles.slider}>
                    <Slider
                      max={playback.duration}
                      value={position}
                      enabled={phase === 'idle'}
                      modifiers={[fillMaxWidth(), semantics({ contentDescription: 'Playback position' })]}
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
            </View>
          );
        }}
      />
      </View>}
      <RootNavigation selected={destination} onSelect={next => { setDestination(next); setMessage(''); }} enabled={canSwitchDestination(phase)} />
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
  timerCard: { alignItems: 'center', padding: 24, gap: 8, borderRadius: 28, backgroundColor: '#F3EDF7' },
  timer: { fontSize: 48, lineHeight: 56, fontVariant: ['tabular-nums'], fontWeight: '500', color: '#1D1B20' },
  emptyState: { gap: 10, paddingTop: 28, paddingBottom: 16 },
  recordingCard: { padding: 16, marginBottom: 12, gap: 10, borderRadius: 20, backgroundColor: '#F3EDF7' },
  recordingBanner: { paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F3EDF7' },
  notice: { color: '#1D1B20', padding: 16, backgroundColor: '#F3EDF7' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  slider: { width: '100%' },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
});
