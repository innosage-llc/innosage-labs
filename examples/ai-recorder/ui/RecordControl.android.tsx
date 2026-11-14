import { Host } from '@expo/ui';
import { Box, Column, Icon, Shape, Text, TextButton } from '@expo/ui/jetpack-compose';
import { background, clip, Shapes, size } from '@expo/ui/jetpack-compose/modifiers';
import MicrophoneIcon from '@expo/material-symbols/mic.xml';
import StopIcon from '@expo/material-symbols/stop.xml';
import type { CapturePhase } from './navigation';
import { useTheme } from './theme';

/** One Material button owns both visible hit regions and merged button semantics. */
export function RecordControl({ phase, onPress }: { phase: CapturePhase; onPress: () => void }) {
  const { palette, mode, spacing, typography } = useTheme();
  const recording = phase === 'recording';
  const disabled = phase !== 'idle' && !recording;
  const label = { idle: 'Start recording', starting: 'Starting…', recording: 'Stop & save', saving: 'Saving…', importing: 'Start recording' }[phase];
  return <Host matchContents colorScheme={mode}>
    <TextButton enabled={!disabled} onClick={onPress}
      shape={Shape.RoundedCorner({ cornerRadii: { topStart: 16, topEnd: 16, bottomStart: 16, bottomEnd: 16 } })}
      contentPadding={{ start: spacing.md, end: spacing.md, top: spacing.sm, bottom: spacing.sm }}
      colors={{ contentColor: palette.text, disabledContentColor: palette.muted }}>
      <Column horizontalAlignment="center" verticalArrangement={{ spacedBy: spacing.md }}>
        <Box contentAlignment="center" modifiers={[size(144, 144), clip(Shapes.Circle), background(disabled ? palette.surface : palette.accent)]}>
          <Icon source={recording || phase === 'saving' ? StopIcon : MicrophoneIcon} size={56}
            tint={disabled ? palette.muted : palette.onAccent} />
        </Box>
        <Text style={{ ...typography.heading, textAlign: 'center' }}>{label}</Text>
      </Column>
    </TextButton>
  </Host>;
}
