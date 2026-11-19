import { Host, Picker } from '@expo/ui';
import { services, type ServiceId } from './ServiceConfig';
import type { ServiceChoiceProps } from './ServiceChoice';
export function ServiceChoice({ service, busy, onChange }: ServiceChoiceProps) {
  const supported: ServiceId[] = ['staging', 'openai'];
  return <Host matchContents><Picker selectedValue={service} enabled={!busy}
    onValueChange={id => { if (id !== 'production') onChange(id); }}>
    {service === 'production' ? <Picker.Item key="production" value="production" label="Production Pro (unavailable on iOS)" /> : null}
    {supported.map(id => <Picker.Item key={id} value={id} label={services[id].label} />)}
  </Picker></Host>;
}
