import { useRef, useState } from 'react';
import { Button, FlatList, StyleSheet, Text, View } from 'react-native';
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
import { ThemeProvider } from './ui/theme';
import { Directory, File, Paths } from 'expo-file-system';

const recordings = new Directory(Paths.document, 'recordings');

function listRecordings() {
  if (!recordings.exists) return [];
  return recordings.list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.m4a'))
    .sort((a, b) => b.name.localeCompare(a.name));
}

function formatTime(time: number) {
  const seconds = Math.floor(time);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function RecorderScreen() {
  const [showPro, setShowPro] = useState(false);
  const [files, setFiles] = useState(listRecordings);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording' | 'saving'>('idle');
  const [message, setMessage] = useState('');
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

  return (
    <SafeAreaView style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>AI Recorder</Text>
      <Text style={styles.copy}>
        {phase === 'recording'
          ? `Recording · ${formatTime(durationMillis / 1000)}`
          : 'Record and play audio saved on this device.'}
      </Text>
      <Button
        title={{ idle: 'Start recording', starting: 'Starting…', recording: 'Stop recording', saving: 'Saving…' }[phase]}
        disabled={phase === 'starting' || phase === 'saving'}
        onPress={phase === 'recording' ? stop : start}
      />
      <Button title="InnoSage Pro" disabled={phase !== 'idle'} onPress={() => setShowPro(true)} />
      {showPro ? <ProSettings onClose={() => setShowPro(false)} /> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{message}</Text> : null}
      <Text accessibilityRole="header" style={styles.heading}>Recordings</Text>
      {transcriptRecording ? <Transcript recording={transcriptRecording} onClose={() => setTranscriptRecording(undefined)} /> : null}
      <FlatList
        data={files}
        keyExtractor={(file) => file.uri}
        ListEmptyComponent={<Text style={styles.copy}>No recordings yet.</Text>}
        extraData={playback}
        renderItem={({ item }) => {
          const selected = playingFile === item.uri;
          const action = selected && playback.playing ? 'Pause' : 'Play';
          const date = new Date(Number(item.name.split('-')[1])).toLocaleString();
          return (
            <View style={styles.recording}>
              <View style={styles.row}>
                <Text style={styles.filename}>{date} · M4A</Text>
                <Button
                  title={action}
                  accessibilityLabel={`${action} recording from ${date}`}
                  disabled={phase !== 'idle'}
                  onPress={() => togglePlayback(item)}
                />
              </View>
              <Button title="Transcript" accessibilityLabel={`Transcript for recording from ${date}`}
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
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><ThemeProvider><RecorderScreen /></ThemeProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff', paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  heading: { fontSize: 19, fontWeight: '600', color: '#111827', marginTop: 12 },
  copy: { fontSize: 16, color: '#374151' },
  filename: { flex: 1, fontSize: 15, color: '#111827' },
  recording: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#d1d5db' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  slider: { width: '100%' },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
});
