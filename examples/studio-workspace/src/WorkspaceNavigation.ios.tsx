import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../ui';
import type { Destination, NavigationProps } from './WorkspaceNavigation';

const destinations: Array<{
  id: Destination;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  selectedIcon: React.ComponentProps<typeof Ionicons>['name'];
}> = [
  { id: 'overview', label: 'Work', icon: 'home-outline', selectedIcon: 'home' },
  { id: 'inbox', label: 'Inbox', icon: 'file-tray-outline', selectedIcon: 'file-tray-full' },
  { id: 'projects', label: 'Projects', icon: 'folder-outline', selectedIcon: 'folder' },
  { id: 'tasks', label: 'Tasks', icon: 'checkmark-circle-outline', selectedIcon: 'checkmark-circle' },
  { id: 'notes', label: 'Notes', icon: 'document-text-outline', selectedIcon: 'document-text' },
];

export function WorkspaceNavigation({ currentScreen, onNavigate }: NavigationProps) {
  const { palette, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const activeScreen = currentScreen === 'project-detail' ? 'projects' : currentScreen;

  return (
    <View
      testID="ios-workspace-tab-bar"
      style={{
        flexDirection: 'row',
        alignSelf: 'stretch',
        alignItems: 'stretch',
        paddingHorizontal: spacing.xs,
        paddingTop: spacing.xs,
        paddingBottom: Math.max(insets.bottom, spacing.xs),
        borderTopWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.surface,
      }}
    >
      {destinations.map(({ id, label, icon, selectedIcon }) => {
        const selected = activeScreen === id;
        const color = selected ? palette.accent : palette.muted;

        return (
          <View key={id} style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }}>
            <Pressable
              testID={`nav-${id}`}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => onNavigate(id)}
              style={{
                minHeight: 50,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
              }}
            >
              <Ionicons name={selected ? selectedIcon : icon} size={22} color={color} />
              <Text
                numberOfLines={1}
                style={[
                  typography.caption,
                  { color, fontSize: 11, lineHeight: 14, fontWeight: selected ? '600' : '400' },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
