import { Button, Host } from '@expo/ui';
import { accessibilityLabel as a11yLabel } from '@expo/ui/swift-ui/modifiers';
import { useTheme } from './theme';

type Props = { title: string; onPress: () => void; disabled?: boolean; accessibilityLabel?: string;
  variant?: 'primary' | 'tonal' | 'outlined' | 'text'; fullWidth?: boolean };

export function ActionButton({ title, onPress, disabled = false, accessibilityLabel, variant = 'tonal', fullWidth = true }: Props) {
  const { mode, palette } = useTheme();
  return <Host matchContents colorScheme={mode} seedColor={palette.accent}
    style={{ alignSelf: fullWidth ? 'stretch' : 'flex-start', minHeight: 48 }}>
    <Button label={title} onPress={onPress} disabled={disabled}
      variant={variant === 'primary' ? 'filled' : variant === 'text' ? 'text' : 'outlined'}
      style={{ height: 48 }} modifiers={accessibilityLabel ? [a11yLabel(accessibilityLabel)] : []} />
  </Host>;
}
