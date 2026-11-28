import { Switch } from 'react-native';
import type { RecorderSwitchProps } from './RecorderSwitch';
export function RecorderSwitch({ value, enabled, label, onCheckedChange }: RecorderSwitchProps) {
  return <Switch value={value} disabled={!enabled} accessibilityLabel={label} onValueChange={onCheckedChange} />;
}
