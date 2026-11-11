import { Switch } from 'react-native';
import type { RecorderSwitchProps } from './RecorderSwitch.types';

export function RecorderSwitch({ value, enabled, onCheckedChange, label }: RecorderSwitchProps) {
  return <Switch value={value} disabled={!enabled} onValueChange={onCheckedChange} accessibilityLabel={label} />;
}
