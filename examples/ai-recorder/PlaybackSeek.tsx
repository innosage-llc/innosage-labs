import { Button, View } from 'react-native';
import type { PlaybackSeekProps } from './PlaybackSeek.types';

// Native iOS buttons avoid loading Jetpack Compose. VoiceOver also exposes
// adjustable actions; every seek uses the same clamped position and callback.
export function PlaybackSeek({ max, value, enabled, onValueChange, onValueChangeFinished }: PlaybackSeekProps) {
  function seek(delta: number) {
    onValueChange(Math.max(0, Math.min(max, value + delta)));
    onValueChangeFinished();
  }
  return <View accessible accessibilityRole="adjustable" accessibilityLabel="Playback position"
    accessibilityValue={{ min: 0, max: Math.floor(max), now: Math.floor(value), text: `${Math.floor(value)} seconds` }}
    accessibilityState={{ disabled: !enabled }}
    accessibilityActions={[{ name: 'increment', label: 'Forward 10 seconds' }, { name: 'decrement', label: 'Back 10 seconds' }]}
    onAccessibilityAction={({ nativeEvent }) => {
      if (!enabled) return;
      if (nativeEvent.actionName === 'increment') seek(10);
      if (nativeEvent.actionName === 'decrement') seek(-10);
    }} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
    <Button title="Back 10 seconds" disabled={!enabled || value <= 0} onPress={() => seek(-10)} />
    <Button title="Forward 10 seconds" disabled={!enabled || value >= max} onPress={() => seek(10)} />
  </View>;
}
