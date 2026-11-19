import { Modal, Text } from 'react-native';
import { DetailShell } from './ui/DetailShell';
import { useTheme } from './ui/theme';
/** Browser launch scope deliberately excludes native key storage/provider access. */
export function ProSettings({ onClose }: { onClose: () => void }) {
  const { palette, spacing } = useTheme();
  return <Modal onRequestClose={onClose}><DetailShell title="Transcription service" onBack={onClose} backLabel="Back to settings">
    <Text style={{ color: palette.text, padding: spacing.lg }}>Recording, file import, transcription and service-key management are available in the Android and iOS apps. No keys or recordings are stored by this browser view.</Text>
  </DetailShell></Modal>;
}
