import { Host, Button } from '@expo/ui';
import { Image, Text, View } from 'react-native';
import type { CapturePhase } from './navigation';
import { useTheme } from './theme';

/** Same Record control/label and theme; disabled because native storage is absent.
 * This is the normal product home, not a separate smoke-test screen.
 */
export function RecordControl({ phase }: { phase: CapturePhase; onPress: () => void }) {
  const { palette, mode, spacing, typography } = useTheme();
  return <Host matchContents colorScheme={mode} seedColor={palette.accent}>
    <Button disabled variant="text" style={{ height: 216, padding: spacing.md }}>
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 144, height: 144, borderRadius: 72, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface }}>
          <Image source={require('../assets/microphone-web.svg')} style={{ width: 56, height: 56 }} />
        </View>
        <Text style={[typography.heading, { color: palette.muted }]}>{phase === 'recording' ? 'Stop & save' : 'Start recording'}</Text>
      </View>
    </Button>
  </Host>;
}
