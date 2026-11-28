import { View, StatusBar } from 'react-native';
import { Host } from '@expo/ui';
import { Button, NavigationStack, RNHostView, TabView, Toolbar, ToolbarItem, VStack } from '@expo/ui/swift-ui';
import { disabled, labelStyle, navigationTitle, navigationBarTitleDisplayMode } from '@expo/ui/swift-ui/modifiers';
import { destinations, type RootDestination } from './navigation';
import type { RootShellProps } from './RootShell';
import { useTheme } from './theme';
const icons = { record: 'mic.fill', library: 'folder', settings: 'gearshape' } as const;

// State remains in RecorderScreen above native tab mounts; the shell owns chrome only.
export function RootShell({ selected, onSelect, enabled, libraryImport, children }: RootShellProps) {
  const { palette, mode } = useTheme();
  return <View style={{ flex: 1, backgroundColor: palette.background }}>
    <StatusBar barStyle={mode === 'light' ? 'dark-content' : 'light-content'} />
    <Host style={{ flex: 1 }} colorScheme={mode}>
      <TabView selection={selected} onSelectionChange={value => {
        if (enabled && destinations.some(item => item.id === value)) onSelect(value as RootDestination);
      }} modifiers={[disabled(!enabled)]}>
        {destinations.map(destination => {
          const modifiers = [navigationTitle(destination.label), navigationBarTitleDisplayMode('inline')];
          const content = <RNHostView>
            <View style={{ flex: 1, backgroundColor: palette.background }}>{selected === destination.id ? children : null}</View>
          </RNHostView>;
          const action = destination.id === 'library' ? libraryImport : undefined;

          return <TabView.Tab key={destination.id} value={destination.id}
            label={destination.label} systemImage={icons[destination.id]}>
            <NavigationStack>
              {action ? <Toolbar modifiers={modifiers}>
                <VStack>{content}</VStack>
                <Toolbar.Content><ToolbarItem placement="topBarTrailing">
                  <Button label={action.accessibilityName} systemImage="square.and.arrow.down"
                    onPress={action.onPress} modifiers={[labelStyle('iconOnly'), disabled(action.disabled)]} />
                </ToolbarItem></Toolbar.Content>
              </Toolbar> : <VStack modifiers={modifiers}>{content}</VStack>}
            </NavigationStack>
          </TabView.Tab>;
        })}
      </TabView>
    </Host>
  </View>;
}
