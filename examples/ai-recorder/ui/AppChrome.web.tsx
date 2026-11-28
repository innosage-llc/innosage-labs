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
      {libraryImport ? <button type="button" aria-label={libraryImport.accessibilityName}
        title={libraryImport.accessibilityName} disabled={libraryImport.disabled} onClick={libraryImport.onPress}
        style={{ display: 'grid', placeItems: 'center', width: 48, height: 48, flexShrink: 0,
          border: 0, borderRadius: '50%', background: 'transparent',
          color: libraryImport.disabled ? palette.muted : palette.text,
          cursor: libraryImport.disabled ? 'default' : 'pointer' }}>
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M11 3h2v9.17l3.59-3.58L18 10l-6 6-6-6 1.41-1.41L11 12.17zM5 18h14v2H5z" />
        </svg>
      </button> : null}
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
