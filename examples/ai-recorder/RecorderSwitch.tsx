import { Host, Switch } from '@expo/ui/jetpack-compose';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';
export type RecorderSwitchProps = { value: boolean; enabled: boolean; label: string; onCheckedChange: (value: boolean) => void };
export function RecorderSwitch({ label, ...props }: RecorderSwitchProps) {
  return <Host matchContents><Switch {...props} modifiers={[semantics({ contentDescription: label })]} /></Host>;
}
