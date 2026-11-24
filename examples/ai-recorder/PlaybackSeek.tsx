import { Host, Slider } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics } from '@expo/ui/jetpack-compose/modifiers';
import type { PlaybackSeekProps } from './PlaybackSeek.types';
import { useTheme } from './ui/theme';
export function PlaybackSeek({ label, useRecordingPalette, ...props }: PlaybackSeekProps) {
  const { mode, palette } = useTheme();
  return <Host matchContents={{ vertical: true }} colorScheme={mode} style={{ width: '100%' }}><Slider {...props}
    colors={useRecordingPalette ? {
      thumbColor: palette.accent,
      activeTrackColor: palette.accent,
      inactiveTrackColor: palette.controlBorder,
    } : undefined}
    modifiers={[fillMaxWidth(), semantics({ contentDescription: label })]} /></Host>;
}
