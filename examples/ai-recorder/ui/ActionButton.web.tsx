import { Host, Button } from '@expo/ui';
import { Text } from 'react-native';
import { useTheme } from './theme';

type Props = { title: string; onPress: () => void; disabled?: boolean; accessibilityLabel?: string;
  variant?: 'primary' | 'tonal' | 'outlined' | 'text'; fullWidth?: boolean };
export function ActionButton({ title, onPress, disabled = false, accessibilityLabel, variant = 'tonal', fullWidth = true }: Props) {
  const { palette, mode } = useTheme();
  return <Host colorScheme={mode} seedColor={palette.accent} style={{ alignSelf: fullWidth ? 'stretch' : 'flex-start' }}>
    <Button onPress={onPress} disabled={disabled} variant={variant === 'primary' ? 'filled' : variant === 'text' ? 'text' : 'outlined'} style={{ height: 48 }}>
      <Text accessibilityLabel={accessibilityLabel} style={{ color: variant === 'primary' ? palette.onAccent : palette.text }}>{title}</Text>
    </Button>
  </Host>;
}
