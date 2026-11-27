import { Modal, ScrollView, Text } from 'react-native';
import { ServiceChoice } from '../ServiceChoice';
import { ActionButton } from './ActionButton';
import { DetailShell } from './DetailShell';
import type { ServiceSettingsLayoutProps, SettingsEntryProps, TranscriptSetupProps } from './service-flow';
import { useTheme } from './theme';

export function SettingsEntry({ serviceLabel, disabled, onOpen }: SettingsEntryProps) {
  const { palette, spacing } = useTheme();
  return <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
    <Text style={{ color: palette.muted }}>{serviceLabel}</Text>
    <ActionButton title="Transcription service" disabled={disabled} onPress={onOpen} />
  </ScrollView>;
}

export function ServiceSettingsLayout({ service, managingKeys, canConfigureKey, busy, message, keys,
  onChange, onOpenKeys, onBack }: ServiceSettingsLayoutProps) {
  const { palette, spacing } = useTheme();
  return <Modal onRequestClose={onBack}>
    <DetailShell title={managingKeys ? 'Service keys' : 'Transcription service'}
      backLabel={managingKeys ? 'Back to transcription service' : 'Back to settings'} onBack={onBack} backDisabled={busy}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg }}>
        {managingKeys ? keys : <>
          <ServiceChoice service={service} busy={busy} onChange={onChange} />
          {canConfigureKey ? <ActionButton title="Manage service keys" disabled={busy} onPress={onOpenKeys} /> : null}
        </>}
        {message ? <Text style={{ color: palette.text }}>{message}</Text> : null}
      </ScrollView>
    </DetailShell>
  </Modal>;
}

export function TranscriptSetup({ title, metadata, message, children }: TranscriptSetupProps) {
  const { palette, spacing, typography } = useTheme();
  return <>
    <Text accessibilityRole="header" style={[typography.title, { color: palette.text }]}>{title}</Text>
    {metadata ? <Text style={{ color: palette.muted }}>{metadata}</Text> : null}
    {message ? <Text style={{ color: palette.text, marginBottom: spacing.sm }}>{message}</Text> : null}
    {children}
  </>;
}
