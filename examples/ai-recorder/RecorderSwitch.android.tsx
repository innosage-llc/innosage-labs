import { Host, Switch } from '@expo/ui/jetpack-compose';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';
import type { RecorderSwitchProps } from './RecorderSwitch.types';

export function RecorderSwitch({ label, ...props }: RecorderSwitchProps) {
  return <Host matchContents style={{ minWidth: 60 }}>
    <Switch {...props} modifiers={[semantics({ contentDescription: label })]} />
  </Host>;
}
