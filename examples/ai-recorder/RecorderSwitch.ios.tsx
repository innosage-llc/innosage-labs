import { Host, Switch } from '@expo/ui';
import { accessibilityLabel } from '@expo/ui/swift-ui/modifiers';
import type { RecorderSwitchProps } from './RecorderSwitch';
export function RecorderSwitch({ label, enabled, onCheckedChange, value }: RecorderSwitchProps) {
  return <Host matchContents><Switch value={value} disabled={!enabled} onValueChange={onCheckedChange}
    modifiers={[accessibilityLabel(label)]} /></Host>;
}
