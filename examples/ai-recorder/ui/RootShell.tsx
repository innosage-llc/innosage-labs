import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader, RootNavigation } from './AppChrome';
import type { RootDestination } from './navigation';
import { useTheme } from './theme';
export type RootShellProps = { selected: RootDestination; onSelect: (destination: RootDestination) => void; enabled: boolean; children: ReactNode };
export function RootShell({ selected, onSelect, enabled, children }: RootShellProps) {
  const { palette } = useTheme();
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: palette.background }}>
    <AppHeader title={{ record: 'Record', library: 'Library', settings: 'Settings' }[selected]} />
    {children}
    <RootNavigation selected={selected} onSelect={onSelect} enabled={enabled} />
  </SafeAreaView>;
}
