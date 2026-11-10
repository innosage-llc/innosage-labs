import {
  Button as NativeButton,
  Host,
  Label,
  NavigationStack,
  Text as NativeText,
  Toolbar,
  ToolbarItem,
} from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  accessibilityIdentifier,
  disabled,
  labelsHidden,
  navigationBarTitleDisplayMode,
  navigationTitle,
} from '@expo/ui/swift-ui/modifiers';
import { useTheme } from '../ui';
import type { TopBarAction, WorkspaceTopBarProps } from './WorkspaceTopBar';

function ToolbarIcon({
  label,
  systemImage,
  testID,
  onPress,
  enabled = true,
}: TopBarAction & { systemImage: 'magnifyingglass' | 'gearshape' | 'plus'; enabled?: boolean }) {
  return (
    <NativeButton
      onPress={onPress}
      modifiers={[accessibilityIdentifier(testID), ...(enabled ? [] : [disabled(true)])]}
    >
      <Label title={label} systemImage={systemImage} modifiers={[labelsHidden()]} />
    </NativeButton>
  );
}

export function WorkspaceTopBar({
  title,
  busy,
  primaryAction,
  onBack,
  onSearch,
  onSettings,
}: WorkspaceTopBarProps) {
  const { mode, palette } = useTheme();

  return (
    <Host colorScheme={mode} seedColor={palette.accent} style={{ width: '100%', height: 56 }}>
      <NavigationStack>
        <Toolbar>
          <NativeText
            modifiers={[
              navigationTitle(title),
              navigationBarTitleDisplayMode('inline'),
              accessibilityHidden(),
            ]}
          >
            {' '}
          </NativeText>
          <Toolbar.Content>
            {onBack ? (
              <ToolbarItem placement="topBarLeading">
                <NativeButton
                  label="Back"
                  systemImage="chevron.left"
                  onPress={onBack}
                  modifiers={[accessibilityIdentifier('header-back')]}
                />
              </ToolbarItem>
            ) : null}
            {primaryAction ? (
              <ToolbarItem placement="topBarTrailing">
                {primaryAction.label === 'Capture' ? (
                  <NativeButton
                    label="Capture"
                    systemImage="plus"
                    onPress={primaryAction.onPress}
                    modifiers={[
                      accessibilityIdentifier(primaryAction.testID),
                      ...(busy ? [disabled(true)] : []),
                    ]}
                  />
                ) : (
                  <ToolbarIcon
                    {...primaryAction}
                    systemImage="plus"
                    enabled={!busy}
                  />
                )}
              </ToolbarItem>
            ) : null}
            {onSearch ? (
              <ToolbarItem placement="topBarTrailing">
                <ToolbarIcon
                  label="Search"
                  testID="nav-search"
                  systemImage="magnifyingglass"
                  onPress={onSearch}
                />
              </ToolbarItem>
            ) : null}
            {onSettings ? (
              <ToolbarItem placement="topBarTrailing">
                <ToolbarIcon
                  label="Settings"
                  testID="nav-settings"
                  systemImage="gearshape"
                  onPress={onSettings}
                />
              </ToolbarItem>
            ) : null}
          </Toolbar.Content>
        </Toolbar>
      </NavigationStack>
    </Host>
  );
}
