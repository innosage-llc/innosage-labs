import { Host, Button as MaterialButton, FilledTonalButton, OutlinedButton, TextButton, Text } from '@expo/ui/jetpack-compose';
import { defaultMinSize, fillMaxWidth, semantics } from '@expo/ui/jetpack-compose/modifiers';
import type { ColorValue } from 'react-native';
import { useTheme } from './theme';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  variant?: 'primary' | 'tonal' | 'outlined' | 'text';
  fullWidth?: boolean;
};

/** Android-native Material 3 action with a consistent 48dp minimum target. */
export function ActionButton({ title, onPress, disabled = false, accessibilityLabel, variant = 'tonal', fullWidth = true }: Props) {
  const { palette, mode } = useTheme();
  const Component = variant === 'primary' ? MaterialButton
    : variant === 'outlined' ? OutlinedButton
      : variant === 'text' ? TextButton : FilledTonalButton;
  const colors = variant === 'primary' ? {
    containerColor: palette.accent as ColorValue,
    contentColor: palette.onAccent as ColorValue,
    disabledContainerColor: palette.surface as ColorValue,
    disabledContentColor: palette.muted as ColorValue,
  } : variant === 'tonal' ? {
    containerColor: palette.surface as ColorValue,
    contentColor: palette.text as ColorValue,
    disabledContainerColor: palette.surface as ColorValue,
    disabledContentColor: palette.muted as ColorValue,
  } : undefined;

  return <Host matchContents={{ vertical: true, horizontal: !fullWidth }} colorScheme={mode}
    style={{ width: fullWidth ? '100%' : undefined, alignSelf: fullWidth ? 'stretch' : 'flex-start', minHeight: 48 }}>
    <Component enabled={!disabled} onClick={onPress} colors={colors}
      modifiers={[defaultMinSize({ minHeight: 48 }), ...(fullWidth ? [fillMaxWidth()] : []), ...(accessibilityLabel ? [semantics({ contentDescription: accessibilityLabel })] : [])]}>
      <Text>{title}</Text>
    </Component>
  </Host>;
}
