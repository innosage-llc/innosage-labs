import { Host, Icon, IconButton } from '@expo/ui/jetpack-compose';
import { defaultMinSize } from '@expo/ui/jetpack-compose/modifiers';
import AudioFileIcon from '@expo/material-symbols/audio_file.xml';
import DownloadIcon from '@expo/material-symbols/download.xml';
import { View } from 'react-native';
import type { LibraryImportButtonProps } from './library-icons';
import { useTheme } from './theme';

export function LibraryImportButton({ importing, disabled, onPress }: LibraryImportButtonProps) {
  const { mode, palette } = useTheme();
  return (
    <Host matchContents colorScheme={mode}>
      <IconButton
        enabled={!disabled}
        onClick={onPress}
        modifiers={[defaultMinSize({ minWidth: 48, minHeight: 48 })]}
      >
        <Icon
          source={DownloadIcon}
          contentDescription={importing ? 'Importing audio' : 'Import audio'}
          size={24}
          tint={disabled ? palette.muted : palette.text}
        />
      </IconButton>
    </Host>
  );
}

export function LibraryAudioIcon() {
  const { mode, palette } = useTheme();
  return (
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ width: 24, height: 24 }}>
      <Host matchContents colorScheme={mode}>
        <Icon source={AudioFileIcon} size={24} tint={palette.accent} />
      </Host>
    </View>
  );
}
