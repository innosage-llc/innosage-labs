import { useId } from 'react';
import { gatewayAvailable } from './GatewayConnection';
import { services } from './ServiceConfig';
import type { ServiceChoiceProps } from './ServiceChoice';

export function ServiceChoice({ service, busy, onChange }: ServiceChoiceProps) {
  const descriptionId = useId();

  return <>
    <select aria-label="Transcription service" aria-describedby={descriptionId} disabled={busy} value={service} onChange={event => {
      const value = event.target.value;
      if (value === 'staging' || value === 'openai') onChange(value);
    }}>
      {service === 'production' ? <option value="production" disabled>Production access unavailable in this browser</option> : null}
      <option value="staging">{services.staging.label}</option>
      <option value="openai">{services.openai.label}</option>
    </select>
    <small id={descriptionId}>
      {gatewayAvailable('staging')
        ? 'Staging Free is configured in this build. Transcription requires an internet connection.'
        : 'Staging Free is unavailable in this build. You can still save Staging as your default.'}
    </small>
  </>;
}
