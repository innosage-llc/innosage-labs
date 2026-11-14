import { Text, View } from 'react-native';
import { FilledIconButton, Host, Icon, Shape } from '@expo/ui/jetpack-compose';
import { semantics, size } from '@expo/ui/jetpack-compose/modifiers';
import MicrophoneIcon from '@expo/material-symbols/mic.xml';
import StopIcon from '@expo/material-symbols/stop.xml';
import type { CapturePhase } from './navigation';
import { useTheme } from './theme';

/** Product-specific Android control; Material owns shape, ripple and button semantics. */
export function RecordControl({ phase, onPress }: { phase: CapturePhase; onPress: () => void }) {
  const { palette, mode, spacing, typography } = useTheme();
  const recording = phase === 'recording';
  const disabled = phase !== 'idle' && !recording;
  const label = { idle: 'Start recording', starting: 'Starting…', recording: 'Stop & save', saving: 'Saving…', importing: 'Start recording' }[phase];
  return <View style={{ alignItems: 'center', gap: spacing.md }}>
    <Host matchContents colorScheme={mode} style={{ width: 144, height: 144 }}>
      <FilledIconButton enabled={!disabled} onClick={onPress} shape={Shape.Circle({})}
        colors={{ containerColor: palette.accent, contentColor: palette.onAccent,
          disabledContainerColor: palette.surface, disabledContentColor: palette.muted }}
        modifiers={[size(144, 144), semantics({ contentDescription: label })]}>
        <Icon source={recording || phase === 'saving' ? StopIcon : MicrophoneIcon} size={56} />
      </FilledIconButton>
    </Host>
    <Text importantForAccessibility="no" style={[typography.heading, { color: palette.text, textAlign: 'center' }]}>{label}</Text>
  </View>;
}
