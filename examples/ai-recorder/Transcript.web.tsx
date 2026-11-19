import { ProSettings } from './ProSettings';
import type { File } from 'expo-file-system';
export function Transcript({ onClose }: { recording: File; recordingTitle: string; onClose: () => void }) {
  return <ProSettings onClose={onClose} />;
}
