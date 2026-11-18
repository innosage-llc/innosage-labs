import { Text, View } from 'react-native';
import { destinations, type RootDestination } from './navigation';
import { ActionButton } from './ActionButton';
import { useTheme } from './theme';

export function AppHeader({ title, onBack, backLabel = 'Back', backDisabled = false }: {
  title: string; onBack?: () => void; backLabel?: string; backDisabled?: boolean;
}) {
  const { palette, spacing, typography } = useTheme();
  return <View style={{ padding: spacing.lg, gap: spacing.sm }}>
    {onBack ? <ActionButton title={backLabel} onPress={onBack} disabled={backDisabled} fullWidth={false} variant="text" /> : null}
    <Text accessibilityRole="header" style={[typography.title, { color: palette.text }]}>{title}</Text>
  </View>;
}
export function RootNavigation({ selected, onSelect, enabled }: { selected: RootDestination; onSelect: (value: RootDestination) => void; enabled: boolean }) {
  const { palette, spacing } = useTheme();
  return <View accessibilityRole="navigation" style={{ flexDirection: 'row', justifyContent: 'space-around', padding: spacing.sm, backgroundColor: palette.surface }}>
    {destinations.map(item => <ActionButton key={item.id} title={item.label} onPress={() => onSelect(item.id)} disabled={!enabled}
      variant={selected === item.id ? 'tonal' : 'text'} fullWidth={false} />)}
  </View>;
}
