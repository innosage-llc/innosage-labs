import { Host, Icon, NavigationBar, NavigationBarItem, Text } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, testID } from '@expo/ui/jetpack-compose/modifiers';
import Home from '@expo/material-symbols/home.xml';
import Inbox from '@expo/material-symbols/inbox.xml';
import Folder from '@expo/material-symbols/folder.xml';
import Tasks from '@expo/material-symbols/check_circle.xml';
import Notes from '@expo/material-symbols/description.xml';
import { useTheme } from '../ui';
import type { NavigationProps } from './WorkspaceNavigation';

const destinations = [
  { id: 'overview', label: 'Work', icon: Home },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'projects', label: 'Projects', icon: Folder },
  { id: 'tasks', label: 'Tasks', icon: Tasks },
  { id: 'notes', label: 'Notes', icon: Notes },
] as const;

export function WorkspaceNavigation({ currentScreen, onNavigate }: NavigationProps) {
  const { palette } = useTheme();
  const active = currentScreen === 'project-detail' ? 'projects' : currentScreen;
  return (
    <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
      <NavigationBar modifiers={[fillMaxWidth()]} containerColor={palette.surface} tonalElevation={0}>
        {destinations.map(({ id, label, icon }) => (
          <NavigationBarItem
            key={id}
            selected={active === id}
            onClick={() => onNavigate(id)}
            modifiers={[testID('nav-' + id)]}
            colors={{
              selectedIconColor: palette.accent,
              selectedTextColor: palette.text,
              selectedIndicatorColor: palette.background,
              unselectedIconColor: palette.muted,
              unselectedTextColor: palette.muted,
            }}
          >
            <NavigationBarItem.Icon><Icon source={icon} /></NavigationBarItem.Icon>
            <NavigationBarItem.Label><Text>{label}</Text></NavigationBarItem.Label>
          </NavigationBarItem>
        ))}
      </NavigationBar>
    </Host>
  );
}
