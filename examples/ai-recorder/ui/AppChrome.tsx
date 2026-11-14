// Android baseline. These are installed Material 3 components, not a custom tab bar.
// The separate iOS candidate must supply its native adapter before enabling iOS.
import { StatusBar } from 'react-native';
import { Host, Icon, IconButton, NavigationBar, NavigationBarItem, Text, TopAppBar } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import BackIcon from '@expo/material-symbols/arrow_back.xml';
import RecordIcon from '@expo/material-symbols/mic.xml';
import LibraryIcon from '@expo/material-symbols/folder.xml';
import SettingsIcon from '@expo/material-symbols/settings.xml';
import { useTheme } from './theme';
import { destinations, type RootDestination } from './navigation';

const icons = { record: RecordIcon, library: LibraryIcon, settings: SettingsIcon };

export function AppHeader({ title, onBack, backLabel = 'Back', backDisabled = false }: {
  title: string; onBack?: () => void; backLabel?: string; backDisabled?: boolean;
}) {
  const { palette, mode } = useTheme();
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
        <TopAppBar.Title><Text>{title}</Text></TopAppBar.Title>
      </TopAppBar>
    </Host>
  </>;
}

export function RootNavigation({ selected, onSelect, enabled }: {
  selected: RootDestination; onSelect: (destination: RootDestination) => void; enabled: boolean;
}) {
  const { palette, mode } = useTheme();
  return <Host matchContents={{ vertical: true }} colorScheme={mode} style={{ width: '100%' }}>
    <NavigationBar containerColor={palette.surface} contentColor={palette.text} tonalElevation={0} modifiers={[fillMaxWidth()]}>
      {destinations.map(destination => <NavigationBarItem key={destination.id}
        selected={selected === destination.id} enabled={enabled}
        onClick={() => onSelect(destination.id)} colors={{
          selectedIconColor: palette.text, selectedTextColor: palette.text,
          selectedIndicatorColor: mode === 'light' ? '#E8DEF8' : '#4A4458', unselectedIconColor: palette.muted,
          unselectedTextColor: palette.muted,
        }}>
        <NavigationBarItem.Icon><Icon source={icons[destination.id]} size={24} /></NavigationBarItem.Icon>
        <NavigationBarItem.Label><Text>{destination.label}</Text></NavigationBarItem.Label>
      </NavigationBarItem>)}
    </NavigationBar>
  </Host>;
}
