import { Host, Icon, IconButton, Text, TextButton, TopAppBar } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, testID } from '@expo/ui/jetpack-compose/modifiers';
import AddIcon from '@expo/material-symbols/add.xml';
import BackIcon from '@expo/material-symbols/arrow_back.xml';
import SearchIcon from '@expo/material-symbols/search.xml';
import SettingsIcon from '@expo/material-symbols/settings.xml';
import type { ImageSourcePropType } from 'react-native';
import { useTheme } from '../ui';
import type { TopBarAction, WorkspaceTopBarProps } from './WorkspaceTopBar';

function BarIcon({ label, onPress, testID: id, source, enabled = true }: TopBarAction & {
  source: ImageSourcePropType;
  enabled?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <IconButton onClick={onPress} enabled={enabled} modifiers={[testID(id)]}>
      <Icon source={source} contentDescription={label} tint={palette.text} />
    </IconButton>
  );
}

export function WorkspaceTopBar({ title, busy, primaryAction, onBack, onSearch, onSettings }: WorkspaceTopBarProps) {
  const { mode, palette } = useTheme();

  return (
    <Host colorScheme={mode} matchContents={{ vertical: true }} style={{ width: '100%' }}>
      <TopAppBar
        key={onBack ? 'with-back' : 'root'}
        windowInsets={{}}
        modifiers={[fillMaxWidth()]}
        colors={{
          containerColor: palette.surface,
          titleContentColor: palette.text,
          navigationIconContentColor: palette.text,
          actionIconContentColor: palette.text,
        }}
      >
        {onBack ? (
          <TopAppBar.NavigationIcon>
            <BarIcon label="Back" testID="header-back" source={BackIcon} onPress={onBack} />
          </TopAppBar.NavigationIcon>
        ) : null}
        <TopAppBar.Title>
          <Text style={{ typography: 'titleLarge' }} maxLines={1} overflow="ellipsis">{title}</Text>
        </TopAppBar.Title>
        <TopAppBar.Actions>
          {primaryAction?.label === 'Capture' ? (
            <TextButton
              enabled={!busy}
              onClick={primaryAction.onPress}
              colors={{ contentColor: palette.accent }}
              modifiers={[testID(primaryAction.testID)]}
            >
              <Text>Capture</Text>
            </TextButton>
          ) : primaryAction ? (
            <BarIcon {...primaryAction} source={AddIcon} enabled={!busy} />
          ) : null}
          {onSearch ? <BarIcon label="Search" testID="nav-search" source={SearchIcon} onPress={onSearch} /> : null}
          {onSettings ? <BarIcon label="Settings" testID="nav-settings" source={SettingsIcon} onPress={onSettings} /> : null}
        </TopAppBar.Actions>
      </TopAppBar>
    </Host>
  );
}
