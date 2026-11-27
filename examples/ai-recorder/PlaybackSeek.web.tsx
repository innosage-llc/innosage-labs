import type { PlaybackSeekProps } from './PlaybackSeek.types';
export function PlaybackSeek({ value, max, enabled, onValueChange, onValueChangeFinished, label }: PlaybackSeekProps) {
  return <input type="range" aria-label={label} min={0} max={max} step="any" value={value} disabled={!enabled}
    onChange={event => { onValueChange(event.target.valueAsNumber); onValueChangeFinished(); }} />;
}
