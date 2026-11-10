import { useState } from 'react';
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
import { Directory, File, Paths } from 'expo-file-system';

const recordings = new Directory(Paths.document, 'recordings');

function listRecordings() {
  if (!recordings.exists) return [];
  return recordings.list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.m4a'))
    .sort((a, b) => b.name.localeCompare(a.name));
}

function RecorderScreen() {
  const [files, setFiles] = useState(listRecordings);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording' | 'saving'>('idle');
  const [message, setMessage] = useState('');
  const player = useAudioPlayer();
  const playback = useAudioPlayerStatus(player);
  const [playingFile, setPlayingFile] = useState<string>();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, (status) => {
    if (!status.isFinished) return;
    try {
      if (status.hasError || !status.url) throw new Error('Recording did not finish.');
      const source = new File(status.url);
      if (!source.exists || !source.size) throw new Error('Recording file is empty.');
      recordings.create({ idempotent: true });
      source.move(new File(recordings, `Recording-${Date.now()}-${source.name}`));
      setFiles(listRecordings());
      setMessage('Recording saved on this device.');
    } catch {
      setMessage('Could not save the recording.');
    } finally {
      setPhase('idle');
    }
  });
  const { durationMillis } = useAudioRecorderState(recorder, 500);
  const seconds = Math.floor(durationMillis / 1000);

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
      await setAudioModeAsync({ allowsRecording: true, allowsBackgroundRecording: true });
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

  function play(file: File) {
    if (playingFile === file.uri && playback.playing) {
      player.pause();
      return;
    }
    player.replace(file.uri);
    setPlayingFile(file.uri);
    player.play();
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>AI Recorder</Text>
      <Text style={styles.copy}>
        {phase === 'recording'
          ? `Recording · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
          : 'Record and play audio saved on this device.'}
      </Text>
      <Button
        title={{ idle: 'Start recording', starting: 'Starting…', recording: 'Stop recording', saving: 'Saving…' }[phase]}
        disabled={phase === 'starting' || phase === 'saving'}
        onPress={phase === 'recording' ? stop : start}
      />
      {message ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{message}</Text> : null}
      <Text accessibilityRole="header" style={styles.heading}>Recordings</Text>
      <FlatList
        data={files}
        keyExtractor={(file) => file.uri}
        ListEmptyComponent={<Text style={styles.copy}>No recordings yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.filename}>{new Date(Number(item.name.split('-')[1])).toLocaleString()} · M4A</Text>
            <Button
              title={playingFile === item.uri && playback.playing ? 'Pause' : 'Play'}
              accessibilityLabel={`${playingFile === item.uri && playback.playing ? 'Pause' : 'Play'} recording from ${new Date(Number(item.name.split('-')[1])).toLocaleString()}`}
              disabled={phase !== 'idle'}
              onPress={() => play(item)}
            />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><RecorderScreen /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff', paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  heading: { fontSize: 19, fontWeight: '600', color: '#111827', marginTop: 12 },
  copy: { fontSize: 16, color: '#374151' },
  filename: { flex: 1, fontSize: 15, color: '#111827' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#d1d5db' },
});
