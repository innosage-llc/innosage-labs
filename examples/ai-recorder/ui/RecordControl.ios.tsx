import { Host } from '@expo/ui';
import { Button, Image, Text, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, background, buttonStyle, disabled as disabledModifier, font, foregroundStyle, frame, padding, shapes } from '@expo/ui/swift-ui/modifiers';
import type { CapturePhase } from './navigation';
import { useTheme } from './theme';

/** One native button owns the circle and visible label, matching the shared action contract. */
export function RecordControl({ phase, onPress }: { phase: CapturePhase; onPress: () => void }) {
  const { palette, mode, spacing } = useTheme();
  const recording = phase === 'recording';
  const disabled = phase !== 'idle' && !recording;
  const label = { idle: 'Start recording', starting: 'Starting…', recording: 'Stop & save', saving: 'Saving…', importing: 'Start recording' }[phase];
  return <Host matchContents colorScheme={mode}>
    <Button onPress={onPress} modifiers={[buttonStyle('plain'), disabledModifier(disabled), accessibilityLabel(label)]}>
      <VStack spacing={spacing.md} modifiers={[padding({ horizontal: spacing.md, vertical: spacing.sm })]}>
        <Image systemName={recording || phase === 'saving' ? 'stop.fill' : 'mic.fill'}
          modifiers={[font({ size: 56 }), foregroundStyle(disabled ? palette.muted : palette.onAccent),
            frame({ width: 144, height: 144 }), background(disabled ? palette.surface : palette.accent, shapes.circle())]} />
        <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(disabled ? palette.muted : palette.text)]}>{label}</Text>
      </VStack>
    </Button>
  </Host>;
}
