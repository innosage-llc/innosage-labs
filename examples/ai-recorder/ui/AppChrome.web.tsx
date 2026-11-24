import { Text, View } from 'react-native';
import { destinations, type RootDestination } from './navigation';
import { ActionButton } from './ActionButton';
import type { AppHeaderProps } from './AppChrome';
import { useTheme } from './theme';

export function AppHeader({ title, onBack, backLabel = 'Back', backDisabled = false, libraryImport }: AppHeaderProps) {
  const { palette, spacing, typography } = useTheme();
  return <View style={{ padding: spacing.lg, gap: spacing.sm }}>
    {onBack ? <ActionButton title={backLabel} onPress={onBack} disabled={backDisabled} fullWidth={false} variant="text" /> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
      <Text accessibilityRole="header" style={[typography.title, { color: palette.text }]}>{title}</Text>
      {libraryImport ? <ActionButton title={libraryImport.importing ? 'Importing…' : 'Import audio'}
        onPress={libraryImport.onPress} disabled={libraryImport.disabled} fullWidth={false} variant="text" /> : null}
    </View>
  </View>;
}
export function RootNavigation({ selected, onSelect, enabled }: { selected: RootDestination; onSelect: (value: RootDestination) => void; enabled: boolean }) {
  const { palette, spacing } = useTheme();
  return <View accessibilityRole="navigation" style={{ flexDirection: 'row', justifyContent: 'space-around', padding: spacing.sm, backgroundColor: palette.surface }}>
    {destinations.map(item => <ActionButton key={item.id} title={item.label} onPress={() => onSelect(item.id)} disabled={!enabled}
      variant={selected === item.id ? 'tonal' : 'text'} fullWidth={false} />)}
  </View>;
}
