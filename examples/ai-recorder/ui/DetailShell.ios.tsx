import { View } from 'react-native';
import { Host } from '@expo/ui';
import { Button, NavigationStack, RNHostView, Toolbar, ToolbarItem } from '@expo/ui/swift-ui';
import { accessibilityLabel, disabled, navigationTitle, navigationBarTitleDisplayMode } from '@expo/ui/swift-ui/modifiers';
import type { DetailShellProps } from './DetailShell';
import { useTheme } from './theme';

export function DetailShell({ title, onBack, backLabel, backDisabled = false, children }: DetailShellProps) {
  const { palette, mode } = useTheme();
  return <Host style={{ flex: 1 }} colorScheme={mode}>
    <NavigationStack>
      <Toolbar modifiers={[navigationTitle(title), navigationBarTitleDisplayMode('inline')]}>
        <RNHostView><View style={{ flex: 1, backgroundColor: palette.background }}>{children}</View></RNHostView>
        <Toolbar.Content><ToolbarItem placement="topBarLeading">
          <Button label={backLabel} onPress={onBack} modifiers={[disabled(backDisabled), accessibilityLabel(backLabel)]} />
        </ToolbarItem></Toolbar.Content>
      </Toolbar>
    </NavigationStack>
  </Host>;
}
