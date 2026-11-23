// Android baseline. These are installed Material 3 components, not a custom tab bar.
// The separate iOS candidate must supply its native adapter before enabling iOS.
import { StatusBar, StyleSheet, View } from 'react-native';
import { Host, Icon, IconButton, NavigationBar, NavigationBarItem, Text, TopAppBar } from '@expo/ui/jetpack-compose';
import { defaultMinSize, fillMaxWidth, semantics } from '@expo/ui/jetpack-compose/modifiers';
import BackIcon from '@expo/material-symbols/arrow_back.xml';
import DownloadIcon from '@expo/material-symbols/download.xml';
import RecordIcon from '@expo/material-symbols/mic.xml';
import LibraryIcon from '@expo/material-symbols/folder.xml';
import SettingsIcon from '@expo/material-symbols/settings.xml';
import { useTheme } from './theme';
import { destinations, type RootDestination } from './navigation';

const icons = { record: RecordIcon, library: LibraryIcon, settings: SettingsIcon };

export type AppHeaderProps = {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  libraryImport?: { importing: boolean; disabled: boolean; onPress: () => void };
};

export function AppHeader({ title, onBack, backLabel = 'Back', backDisabled = false, libraryImport }: AppHeaderProps) {
  const { palette, mode } = useTheme();
  const isLibraryRoot = title === 'Library' && !onBack;
  return <>
    <StatusBar barStyle={mode === 'light' ? 'dark-content' : 'light-content'} />
    <Host matchContents={{ vertical: true }} colorScheme={mode} style={{ width: '100%' }}>
      <TopAppBar windowInsets={{}} modifiers={[fillMaxWidth()]} colors={{
        containerColor: palette.background, titleContentColor: palette.text,
        navigationIconContentColor: palette.text,
      }}>
        {onBack ? <TopAppBar.NavigationIcon>
          <IconButton onClick={onBack} enabled={!backDisabled}>
            <Icon source={BackIcon} contentDescription={backLabel} size={24} />
          </IconButton>
        </TopAppBar.NavigationIcon> : null}
        <TopAppBar.Title>
          {isLibraryRoot ? <Text style={{ typography: 'headlineMedium' }}>{title}</Text> : <Text>{title}</Text>}
        </TopAppBar.Title>
        {libraryImport ? <TopAppBar.Actions>
          <IconButton
            enabled={!libraryImport.disabled}
            onClick={libraryImport.onPress}
            modifiers={[defaultMinSize({ minWidth: 48, minHeight: 48 })]}
          >
            <Icon
              source={DownloadIcon}
              contentDescription={libraryImport.importing ? 'Importing audio' : 'Import audio'}
              size={24}
              tint={libraryImport.disabled ? palette.muted : palette.text}
            />
          </IconButton>
        </TopAppBar.Actions> : null}
      </TopAppBar>
    </Host>
  </>;
}

export function RootNavigation({ selected, onSelect, enabled }: {
  selected: RootDestination; onSelect: (destination: RootDestination) => void; enabled: boolean;
}) {
  const { palette, mode } = useTheme();
  return <>
    <View pointerEvents="none" style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.border }} />
    <Host matchContents={{ vertical: true }} colorScheme={mode} style={{ width: '100%' }}>
      <NavigationBar containerColor={palette.background} contentColor={palette.text} tonalElevation={0} modifiers={[fillMaxWidth()]}>
        {destinations.map(destination => <NavigationBarItem key={destination.id}
          selected={selected === destination.id} enabled={enabled}
          modifiers={[semantics({ contentDescription: destination.label })]}
          onClick={() => onSelect(destination.id)} colors={{
            selectedIconColor: palette.accent,
            selectedIndicatorColor: mode === 'light' ? '#E8DEF8' : '#4A4458', unselectedIconColor: palette.muted,
          }}>
          <NavigationBarItem.Icon><Icon source={icons[destination.id]} size={24} /></NavigationBarItem.Icon>
        </NavigationBarItem>)}
      </NavigationBar>
    </Host>
  </>;
}
