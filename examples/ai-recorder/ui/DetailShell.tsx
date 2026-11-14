import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from './AppChrome';
import { useTheme } from './theme';
export type DetailShellProps = { title: string; onBack: () => void; backLabel: string; backDisabled?: boolean; children: ReactNode };
export function DetailShell({ children, ...header }: DetailShellProps) {
  const { palette } = useTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}><AppHeader {...header} />{children}</SafeAreaView>;
}
