import { Host, Slider } from '@expo/ui';
import type { PlaybackSeekProps } from './PlaybackSeek.types';
export function PlaybackSeek({ value, max, enabled, onValueChange, onValueChangeFinished, label }: PlaybackSeekProps) {
  return <Host><Slider value={value} min={0} max={max} disabled={!enabled} onValueChange={value => { onValueChange(value); onValueChangeFinished(); }} testID={label} /></Host>;
}
