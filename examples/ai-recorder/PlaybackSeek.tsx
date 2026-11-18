import { Host, Slider } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics } from '@expo/ui/jetpack-compose/modifiers';
import type { PlaybackSeekProps } from './PlaybackSeek.types';
export function PlaybackSeek({ label, ...props }: PlaybackSeekProps) {
  return <Host matchContents={{ vertical: true }} style={{ width: '100%' }}><Slider {...props}
    modifiers={[fillMaxWidth(), semantics({ contentDescription: label })]} /></Host>;
}
