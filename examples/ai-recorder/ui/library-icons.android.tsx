import { Host, Icon } from '@expo/ui/jetpack-compose';
import AudioFileIcon from '@expo/material-symbols/audio_file.xml';
import { View } from 'react-native';
import type { LibraryAudioIconProps } from './library-icons';
import { useTheme } from './theme';

export function LibraryAudioIcon({ highlighted }: LibraryAudioIconProps) {
  const { mode, palette, spacing } = useTheme();
  return (
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: spacing.sm,
      backgroundColor: highlighted ? palette.border : palette.surface,
    }}>
      <Host matchContents colorScheme={mode}>
        <Icon source={AudioFileIcon} size={24} tint={palette.accent} />
      </Host>
    </View>
  );
}
