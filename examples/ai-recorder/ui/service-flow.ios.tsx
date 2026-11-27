import { Host } from '@expo/ui';
import { Image } from '@expo/ui/swift-ui';
import { font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { services } from '../ServiceConfig';
import { DetailShell } from './DetailShell';
import type { ServiceSettingsLayoutProps, SettingsEntryProps, TranscriptSetupProps } from './service-flow';
import { useTheme } from './theme';

const openAILabel = `${services.openai.label} direct`;
const productionStatus = 'Unsupported on iOS';

function ServiceRow({ title, detail, disclosure, selected, disabled, onPress }: {
  title: string;
  detail?: string;
  disclosure?: boolean;
  selected?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { mode, palette, spacing, typography } = useTheme();
  const symbol = disclosure ? 'chevron.forward' : selected ? 'checkmark' : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        minHeight: 56,
        paddingVertical: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: palette.border,
        backgroundColor: pressed ? palette.surface : undefined,
      })}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={[typography.body, { color: disabled && !selected ? palette.muted : palette.text, fontWeight: '600' }]}>
          {title}
        </Text>
        {detail ? <Text style={[typography.dayLabel, { color: palette.muted }]}>{detail}</Text> : null}
      </View>
      {symbol ? (
        <View accessibilityElementsHidden pointerEvents="none" style={{ width: 24, alignItems: 'center' }}>
          <Host matchContents colorScheme={mode}>
            <Image
              systemName={symbol}
              modifiers={[font({ size: 16 }), foregroundStyle(selected && !disabled ? palette.accent : palette.muted)]}
            />
          </Host>
        </View>
      ) : null}
    </Pressable>
  );
}

export function SettingsEntry({ serviceLabel, disabled, onOpen }: SettingsEntryProps) {
  const { spacing } = useTheme();
  let current = serviceLabel;
  if (serviceLabel === services.openai.label) current = openAILabel;
  if (serviceLabel === services.production.label) current = `${serviceLabel} · ${productionStatus}`;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: spacing.lg }}>
      <ServiceRow title="Transcription service" detail={current} disclosure disabled={disabled} onPress={onOpen} />
    </ScrollView>
  );
}

export function ServiceSettingsLayout({
  service, serviceLabel, stagingAvailable, managingKeys, canConfigureKey, busy, message, keys,
  onChange, onOpenKeys, onBack,
}: ServiceSettingsLayoutProps) {
  const { palette, spacing, typography } = useTheme();
  const loading = service === undefined && busy;
  const canManageKey = service === 'openai' && canConfigureKey;
  const showKeyScreen = managingKeys && canManageKey;
  const muted = [typography.body, { color: palette.muted }];

  return (
    <Modal onRequestClose={onBack}>
      <DetailShell
        title={showKeyScreen ? 'OpenAI project key' : 'Transcription service'}
        backLabel={showKeyScreen ? 'Back to transcription service' : 'Back to settings'}
        onBack={onBack}
        backDisabled={busy}
      >
        <ScrollView
          key={showKeyScreen ? 'keys' : 'services'}
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustKeyboardInsets={showKeyScreen}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
        >
          {showKeyScreen ? keys : loading ? (
            <Text style={muted}>Loading transcription settings…</Text>
          ) : (
            <>
              <Text style={muted}>Choose the default for new transcriptions. Existing jobs keep their service.</Text>
              {service === 'production' ? (
                <View style={{ gap: spacing.xs }}>
                  <Text style={[typography.heading, { color: palette.text }]}>{serviceLabel}</Text>
                  <Text style={muted}>Current default · {productionStatus}</Text>
                </View>
              ) : null}
              <View>
                <ServiceRow
                  title={services.staging.label}
                  detail={stagingAvailable ? 'Free access available in this build' : 'Free access unavailable in this build'}
                  selected={service === 'staging'}
                  disabled={busy}
                  onPress={() => onChange('staging')}
                />
                <ServiceRow
                  title={openAILabel}
                  detail="Uses your OpenAI Platform project key"
                  selected={service === 'openai'}
                  disabled={busy}
                  onPress={() => onChange('openai')}
                />
              </View>
              {canManageKey ? (
                <ServiceRow title="Manage OpenAI project key" disclosure disabled={busy} onPress={onOpenKeys} />
              ) : null}
            </>
          )}
          {message ? <Text selectable style={[typography.body, { color: palette.text }]}>{message}</Text> : null}
        </ScrollView>
      </DetailShell>
    </Modal>
  );
}

export function TranscriptSetup({ title, metadata, message, children }: TranscriptSetupProps) {
  const { palette, spacing, typography } = useTheme();
  return (
    <>
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" selectable style={[typography.title, { color: palette.text, fontWeight: '600' }]}>
          {title}
        </Text>
        {metadata ? <Text style={[typography.dayLabel, { color: palette.muted }]}>{metadata}</Text> : null}
      </View>
      {message ? <Text selectable style={[typography.body, { color: palette.text }]}>{message}</Text> : null}
      {children}
    </>
  );
}
