import { Host } from '@expo/ui';
import { Slider } from '@expo/ui/swift-ui';
import { accessibilityLabel, disabled } from '@expo/ui/swift-ui/modifiers';
import type { PlaybackSeekProps } from './PlaybackSeek.types';
export function PlaybackSeek({ enabled, label, onValueChangeFinished, ...props }: PlaybackSeekProps) {
  return <Host matchContents={{ vertical: true }} style={{ width: '100%' }}><Slider {...props}
    onEditingChanged={editing => { if (!editing) onValueChangeFinished(); }}
    modifiers={[disabled(!enabled), accessibilityLabel(label)]} /></Host>;
}
