import { View, StatusBar } from 'react-native';
import { Host } from '@expo/ui';
import { NavigationStack, RNHostView, TabView, VStack } from '@expo/ui/swift-ui';
import { disabled, navigationTitle, navigationBarTitleDisplayMode } from '@expo/ui/swift-ui/modifiers';
import { destinations, type RootDestination } from './navigation';
import type { RootShellProps } from './RootShell';
import { useTheme } from './theme';
const icons = { record: 'mic.fill', library: 'waveform', settings: 'gearshape' } as const;

// State remains in RecorderScreen above native tab mounts; the shell owns chrome only.
export function RootShell({ selected, onSelect, enabled, children }: RootShellProps) {
  const { palette, mode } = useTheme();
  return <View style={{ flex: 1, backgroundColor: palette.background }}>
    <StatusBar barStyle={mode === 'light' ? 'dark-content' : 'light-content'} />
    <Host style={{ flex: 1 }} colorScheme={mode}>
      <TabView selection={selected} onSelectionChange={value => {
        if (enabled && destinations.some(item => item.id === value)) onSelect(value as RootDestination);
      }} modifiers={[disabled(!enabled)]}>
        {destinations.map(destination => <TabView.Tab key={destination.id} value={destination.id}
          label={destination.label} systemImage={icons[destination.id]}>
          <NavigationStack>
            <VStack modifiers={[navigationTitle(destination.label), navigationBarTitleDisplayMode('inline')]}><RNHostView>
              <View style={{ flex: 1, backgroundColor: palette.background }}>{selected === destination.id ? children : null}</View>
            </RNHostView></VStack>
          </NavigationStack>
        </TabView.Tab>)}
      </TabView>
    </Host>
  </View>;
}
