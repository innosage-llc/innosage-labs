import { Text, View } from 'react-native';
import { Host, RadioButton } from '@expo/ui/jetpack-compose';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';
import { services, type ServiceId } from './ServiceConfig';
import { useTheme } from './ui/theme';
export type ServiceChoiceProps = { service: ServiceId; busy: boolean; onChange: (id: ServiceId) => void };
export function ServiceChoice({ service, busy, onChange }: ServiceChoiceProps) {
  const { palette, spacing } = useTheme();
  return <>{(['production', 'staging', 'openai'] as const).map(id => <View key={id}
    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
    <Host matchContents style={{ minWidth: 48 }}><RadioButton selected={service === id} enabled={!busy} onClick={() => onChange(id)}
      modifiers={[semantics({ contentDescription: services[id].label })]} /></Host>
    <Text onPress={busy ? undefined : () => onChange(id)} style={{ color: palette.text }}>{services[id].label}</Text>
  </View>)}</>;
}
