import { Pressable, Text, View } from 'react-native';
import { Host, RadioButton } from '@expo/ui/jetpack-compose';
import { services, type ServiceId } from './ServiceConfig';
import { useTheme } from './ui/theme';
export type ServiceChoiceProps = { service: ServiceId; busy: boolean; onChange: (id: ServiceId) => void };
export function ServiceChoice({ service, busy, onChange }: ServiceChoiceProps) {
  const { mode, palette, spacing, typography } = useTheme();
  return <>{(['production', 'staging', 'openai'] as const).map(id => (
    <Pressable key={id} accessibilityRole="radio" accessibilityLabel={services[id].label}
      accessibilityState={{ checked: service === id, disabled: busy }}
      disabled={busy} onPress={() => onChange(id)}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: spacing.sm, gap: spacing.lg,
        backgroundColor: pressed ? palette.surface : palette.background,
      })}>
      <Text style={[typography.body, { color: palette.text, flex: 1, fontWeight: service === id ? '600' : '400' }]}>
        {services[id].label}
      </Text>
      <View importantForAccessibility="no-hide-descendants" pointerEvents="none">
        <Host matchContents colorScheme={mode}>
          <RadioButton selected={service === id} enabled={!busy} colors={{ selectedColor: palette.accent, unselectedColor: palette.muted }} />
        </Host>
      </View>
    </Pressable>
  ))}</>;
}
