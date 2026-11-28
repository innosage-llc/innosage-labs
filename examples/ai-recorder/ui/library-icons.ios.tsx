import { Host } from '@expo/ui';
import { Image } from '@expo/ui/swift-ui';
import { font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { View } from 'react-native';
import type { LibraryAudioIconProps } from './library-icons';
import { useTheme } from './theme';

export function LibraryAudioIcon({ highlighted }: LibraryAudioIconProps) {
  const { mode, palette, spacing } = useTheme();

  return (
    <View pointerEvents="none" accessibilityElementsHidden style={{ width: 24, alignItems: 'center', paddingTop: spacing.xs }}>
      <Host matchContents colorScheme={mode}>
        <Image systemName="waveform" modifiers={[font({ size: 20 }), foregroundStyle(highlighted ? palette.accent : palette.muted)]} />
      </Host>
    </View>
  );
}
