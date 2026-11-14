import { Host, Picker } from '@expo/ui';
import { services, type ServiceId } from './ServiceConfig';
import type { ServiceChoiceProps } from './ServiceChoice';
export function ServiceChoice({ service, busy, onChange }: ServiceChoiceProps) {
  return <Host matchContents><Picker selectedValue={service} enabled={!busy} onValueChange={onChange}>
    {(['production', 'staging', 'openai'] as ServiceId[]).map(id => <Picker.Item key={id} value={id} label={services[id].label} />)}
  </Picker></Host>;
}
