import { View, Text } from 'react-native';
import { Host } from '@expo/ui';
import { Button, Image } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, buttonBorderShape, disabled as disabledModifier, frame, font, tint } from '@expo/ui/swift-ui/modifiers';
import type { CapturePhase } from './navigation';
import { useTheme } from './theme';

export function RecordControl({ phase, onPress }: { phase: CapturePhase; onPress: () => void }) {
  const { palette, mode, spacing, typography } = useTheme();
  const recording = phase === 'recording';
  const disabled = phase !== 'idle' && !recording;
  const label = { idle: 'Start recording', starting: 'Starting…', recording: 'Stop & save', saving: 'Saving…', importing: 'Start recording' }[phase];
  return <View style={{ alignItems: 'center', gap: spacing.md }}>
    <Host matchContents colorScheme={mode} style={{ width: 144, height: 144 }}>
      <Button onPress={onPress} modifiers={[buttonStyle('borderedProminent'), buttonBorderShape('circle'),
        tint(palette.accent), disabledModifier(disabled), accessibilityLabel(label)]}>
        <Image systemName={recording || phase === 'saving' ? 'stop.fill' : 'mic.fill'}
          modifiers={[font({ size: 56 }), frame({ width: 120, height: 120 })]} />
      </Button>
    </Host>
    <Text accessible={false} style={[typography.heading, { color: palette.text, textAlign: 'center' }]}>{label}</Text>
  </View>;
}
