import { Box, Host, Slider } from '@expo/ui/jetpack-compose';
import { Shapes, background, clip, defaultMinSize, fillMaxWidth, height, semantics, size } from '@expo/ui/jetpack-compose/modifiers';
import type { PlaybackSeekProps } from './PlaybackSeek.types';
import { useTheme } from './ui/theme';
export function PlaybackSeek({ label, useRecordingPalette, ...props }: PlaybackSeekProps) {
  const { mode, palette } = useTheme();
  const progress = props.max > 0 ? Math.max(0, Math.min(1, props.value / props.max)) : 0;
  const active = props.enabled ? palette.accent : palette.muted;
  return <Host matchContents={{ vertical: true }} colorScheme={mode} style={{ width: '100%' }}><Slider {...props}
    modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: 48 }), semantics({ contentDescription: label })]}>
    {useRecordingPalette ? <>
      <Slider.Thumb>
        <Box modifiers={[size(14, 14), clip(Shapes.Circle), background(active)]} />
      </Slider.Thumb>
      <Slider.Track>
        <Box contentAlignment="centerStart"
          modifiers={[fillMaxWidth(), height(4), clip(Shapes.Circle), background(palette.controlBorder)]}>
          {progress > 0 ? <Box modifiers={[fillMaxWidth(progress), height(4), background(active)]} /> : null}
        </Box>
      </Slider.Track>
    </> : null}
  </Slider></Host>;
}
