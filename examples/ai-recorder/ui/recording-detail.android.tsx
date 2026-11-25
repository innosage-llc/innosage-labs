import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text as NativeText, View } from 'react-native';
import { FilledIconButton, Host, Icon, Row, Text, TextButton } from '@expo/ui/jetpack-compose';
import { defaultMinSize, fillMaxWidth, semantics, size } from '@expo/ui/jetpack-compose/modifiers';
import PlayIcon from '@expo/material-symbols/play_arrow.xml';
import PauseIcon from '@expo/material-symbols/pause.xml';
import ShareIcon from '@expo/material-symbols/share.xml';
import DocumentIcon from '@expo/material-symbols/description.xml';
import SummaryIcon from '@expo/material-symbols/article.xml';
import { PlaybackSeek } from '../PlaybackSeek';
import { readRecordingDocumentActions, type RecordingDocumentActions } from '../savedRecordingDocuments';
import { DetailShell } from './DetailShell';
import type { RecordingDetailProps } from './recording-detail';
import { formatRecordingTime, knownRecordingDuration, recordingDate, recordingDayLabel, recordingTimeLabel } from './recording-display';
import { useTheme } from './theme';

function DetailAction({ label, recording, icon, disabled, onPress }: {
  label: string;
  recording: string;
  icon: typeof ShareIcon;
  disabled: boolean;
  onPress: () => void;
}) {
  const { palette, mode, spacing, typography } = useTheme();
  return <Host colorScheme={mode} matchContents={{ vertical: true }} style={{ width: '100%' }}>
    <TextButton onClick={onPress} enabled={!disabled}
      colors={{ contentColor: palette.text, disabledContentColor: palette.muted }}
      contentPadding={{ start: 0, end: 0, top: spacing.sm, bottom: spacing.sm }}
      modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: 56 }), semantics({ contentDescription: `${label} for ${recording}` })]}>
      <Row modifiers={[fillMaxWidth()]} verticalAlignment="center" horizontalArrangement={{ spacedBy: spacing.lg }}>
        <Icon source={icon} size={24} tint={disabled ? palette.muted : palette.text} />
        <Text style={typography.body}>{label}</Text>
      </Row>
    </TextButton>
  </Host>;
}

export function RecordingDetail({
  recording, file, playing, seek, message, disabled, shareDisabled, onBack, onTogglePlayback, onShare, onTranscript, onSummary,
}: RecordingDetailProps) {
  const { palette, mode, spacing, typography } = useTheme();
  const [documents, setDocuments] = useState<RecordingDocumentActions>();
  useEffect(() => {
    let current = true;
    void readRecordingDocumentActions(file).then(
      actions => { if (current) setDocuments(actions); },
      () => { if (current) setDocuments({ transcript: 'Transcript', summary: false }); },
    );
    return () => { current = false; };
  }, [file]);

  const date = recordingDate(recording.createdAt);
  const title = recording.label;
  const time = date && recordingTimeLabel(date, 'minute');
  const dateLabel = date && recordingDayLabel(date, new Date());
  const metadataDuration = recording.durationSeconds;
  const duration = seek?.max ?? metadataDuration;
  const knownDuration = knownRecordingDuration(duration);
  const action = playing ? 'Pause' : 'Play';
  const divider = { height: StyleSheet.hairlineWidth, backgroundColor: palette.border };

  return <Modal onRequestClose={onBack}>
    <DetailShell title="Recording" quietTitle backLabel="Back to Library" onBack={onBack}>
      <ScrollView contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl, paddingBottom: spacing.xxxl }}>
        {dateLabel ? <NativeText style={[typography.dayLabel, { color: palette.muted, marginBottom: spacing.lg }]}>
          {title === time ? dateLabel : `${dateLabel} · ${time}`}
        </NativeText> : null}
        <NativeText accessibilityRole="header" selectable textBreakStrategy="simple"
          style={[typography.title, { color: palette.text, fontWeight: '600' }]}>
          {title}
        </NativeText>
        <NativeText style={[typography.dayLabel, { color: palette.muted, marginTop: spacing.lg }]}>
          M4A audio · On this device
        </NativeText>

        <View style={[divider, { marginTop: spacing.xxxl }]} />
        <View style={{ marginTop: spacing.md, paddingBottom: spacing.xxxl, alignItems: 'center' }}>
          {knownDuration && duration !== undefined ? <>
            {seek ? <PlaybackSeek {...seek} enabled={!disabled} useRecordingPalette label={`Playback position for ${title}`} />
              : <View style={{ alignSelf: 'stretch', height: 48, justifyContent: 'center' }} importantForAccessibility="no-hide-descendants">
                <View style={{ height: 4, borderRadius: spacing.xs, backgroundColor: palette.controlBorder }} />
              </View>}
            <View style={{ alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm }}>
              <NativeText accessibilityLabel={`Elapsed ${formatRecordingTime(seek?.value ?? 0)}`}
                style={[typography.caption, { color: palette.muted, fontVariant: ['tabular-nums'] }]}>
                {formatRecordingTime(seek?.value ?? 0)}
              </NativeText>
              <NativeText accessibilityLabel={`Duration ${knownDuration}`}
                style={[typography.caption, { color: palette.muted, fontVariant: ['tabular-nums'] }]}>
                {formatRecordingTime(duration)}
              </NativeText>
            </View>
          </> : <NativeText style={[typography.caption, { color: palette.muted }]}>Duration unknown</NativeText>}
          <View style={{ marginTop: spacing.md }}>
            <Host matchContents colorScheme={mode}>
              <FilledIconButton enabled={!disabled} onClick={onTogglePlayback}
                colors={{ containerColor: palette.accent, contentColor: palette.onAccent }}
                modifiers={[size(60, 60)]}>
                <Icon source={playing ? PauseIcon : PlayIcon} size={28} contentDescription={`${action} ${title}`} />
              </FilledIconButton>
            </Host>
          </View>
        </View>
        {message ? <NativeText accessibilityLiveRegion="polite" selectable
          style={[typography.body, { color: palette.text, marginBottom: spacing.md }]}>{message}</NativeText> : null}
        <View style={divider} />
        <DetailAction label="Share audio" recording={title} icon={ShareIcon} disabled={disabled || shareDisabled} onPress={onShare} />
        {documents ? <DetailAction label={documents.transcript} recording={title} icon={DocumentIcon}
          disabled={disabled} onPress={onTranscript} /> : null}
        {documents?.summary ? <DetailAction label="Open summary" recording={title} icon={SummaryIcon}
          disabled={disabled} onPress={onSummary} /> : null}
      </ScrollView>
    </DetailShell>
  </Modal>;
}
