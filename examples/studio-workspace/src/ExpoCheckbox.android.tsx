import { Checkbox, Host } from '@expo/ui/jetpack-compose';
import { semantics, testID as testTag } from '@expo/ui/jetpack-compose/modifiers';
import { useTheme } from '../ui';
import type { ExpoCheckboxProps } from './ExpoCheckbox';

export function ExpoCheckbox({ value, label, onValueChange, testID }: ExpoCheckboxProps) {
  const { mode, palette } = useTheme();
  return (
    <Host colorScheme={mode} matchContents style={{ width: 48, height: 48 }}>
      <Checkbox
        value={value}
        onCheckedChange={onValueChange}
        colors={{ checkedColor: palette.accent, checkmarkColor: palette.onAccent }}
        modifiers={[semantics({ contentDescription: label }), ...(testID ? [testTag(testID)] : [])]}
      />
    </Host>
  );
}
