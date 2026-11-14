import { Host } from '@expo/ui';
import { Button, NavigationStack, Toolbar, ToolbarItem, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, disabled, navigationTitle, navigationBarTitleDisplayMode } from '@expo/ui/swift-ui/modifiers';
import { useTheme } from './theme';

/** Native toolbar for existing modal details; root tabs use RootShell's stack. */
export function AppHeader({ title, onBack, backLabel = 'Back', backDisabled = false }: {
  title: string; onBack?: () => void; backLabel?: string; backDisabled?: boolean;
}) {
  const { mode } = useTheme();
  return <Host style={{ height: 56, width: '100%' }} colorScheme={mode}>
    <NavigationStack>
      <Toolbar modifiers={[navigationTitle(title), navigationBarTitleDisplayMode('inline')]}>
        <VStack>{null}</VStack>
        <Toolbar.Content>{onBack ? <ToolbarItem placement="topBarLeading">
          <Button label={backLabel} onPress={onBack} modifiers={[disabled(backDisabled), accessibilityLabel(backLabel)]} />
        </ToolbarItem> : null}</Toolbar.Content>
      </Toolbar>
    </NavigationStack>
  </Host>;
}
