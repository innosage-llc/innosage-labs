import { Host } from '@expo/ui';
import type { File } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlaybackSeek } from '../PlaybackSeek';
import type { PlaybackSeekProps } from '../PlaybackSeek.types';
import { readRecordingDocumentActions, type RecordingDocumentActions } from '../savedRecordingDocuments';
import { ActionButton } from './ActionButton';
import { DetailShell } from './DetailShell';
import { RecordingActions } from './recording-actions';
import { formatRecordingTime, knownRecordingDuration, recordingDate, recordingDayLabel, recordingDuration, recordingRowText, type RecordingSummary } from './recording-display';
import { useTheme } from './theme';

export type RecordingDetailProps = {
  recording: RecordingSummary;
  file: File;
  playing: boolean;
  seek?: Omit<PlaybackSeekProps, 'enabled' | 'label'>;
  message?: string;
  disabled: boolean;
  shareDisabled: boolean;
  onBack: () => void;
  onTogglePlayback: () => void;
  onShare: () => void;
  onTranscript: () => void;
  onSummary: () => void;
};

function IOSDetailAction({ label, title, symbol, disabled, onPress }: {
  label: string;
  title: string;
  symbol: 'square.and.arrow.up' | 'doc.text' | 'list.bullet.rectangle';
  disabled: boolean;
  onPress: () => void;
}) {
  const { Image } = require('@expo/ui/swift-ui') as typeof import('@expo/ui/swift-ui');
  const { font, foregroundStyle } = require('@expo/ui/swift-ui/modifiers') as typeof import('@expo/ui/swift-ui/modifiers');
  const { mode, palette, spacing, typography } = useTheme();
  const color = disabled ? palette.muted : palette.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} for ${title}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 48,
        gap: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: pressed ? palette.surface : undefined,
      })}
    >
      <View pointerEvents="none" accessibilityElementsHidden style={{ width: 24, alignItems: 'center' }}>
        <Host matchContents colorScheme={mode}>
          <Image systemName={symbol} modifiers={[font({ size: 20 }), foregroundStyle(color)]} />
        </Host>
      </View>
      <Text style={[typography.body, { color, flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

function IOSRecordingDetail({
  recording, file, playing, seek, message, disabled, shareDisabled, onBack, onTogglePlayback, onShare, onTranscript, onSummary,
}: RecordingDetailProps) {
  const { Button, Image } = require('@expo/ui/swift-ui') as typeof import('@expo/ui/swift-ui');
  const { accessibilityLabel, background, buttonStyle, disabled: nativeDisabled, font, foregroundStyle, frame, shapes } =
    require('@expo/ui/swift-ui/modifiers') as typeof import('@expo/ui/swift-ui/modifiers');
  const { mode, palette, spacing, typography } = useTheme();
  const [documentState, setDocumentState] = useState<{ file: File; actions: RecordingDocumentActions }>();
  useEffect(() => {
    let current = true;
    void readRecordingDocumentActions(file).then(
      actions => { if (current) setDocumentState({ file, actions }); },
      () => { if (current) setDocumentState({ file, actions: { transcript: 'Transcript', summary: false } }); },
    );
    return () => { current = false; };
  }, [file]);

  const documents = documentState?.file === file ? documentState.actions : undefined;
  const date = recordingDate(recording.createdAt);
  const { title, time } = recordingRowText(recording.label, date);
  const dateLabel = date && recordingDayLabel(date, new Date());
  const activeSeek = seek && Number.isFinite(seek.max) && seek.max > 0 ? seek : undefined;
  const duration = activeSeek?.max ?? recording.durationSeconds;
  const knownDuration = knownRecordingDuration(duration);
  const elapsed = formatRecordingTime(activeSeek?.value ?? 0);
  const action = playing ? 'Pause' : 'Play';
  const metadataStyle = [typography.dayLabel, { color: palette.muted, maxWidth: '100%' as const }];
  const timeStyle = [typography.caption, { color: palette.muted, fontVariant: ['tabular-nums' as const] }];
  const divider = { height: StyleSheet.hairlineWidth, backgroundColor: palette.border };

  return (
    <Modal onRequestClose={onBack}>
      <DetailShell title="Recording" backLabel="Back to Library" onBack={onBack}>
        <ScrollView
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl, paddingBottom: spacing.xxxl, gap: spacing.xl }}
        >
          <View style={{ gap: spacing.sm }}>
            {dateLabel ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.xs }}>
                <Text style={metadataStyle}>{dateLabel}</Text>
                {time ? <Text style={metadataStyle}>{time}</Text> : null}
              </View>
            ) : null}
            <Text accessibilityRole="header" selectable style={[typography.title, { color: palette.text, fontWeight: '600' }]}>
              {title}
            </Text>
            <Text style={metadataStyle}>M4A audio · On this device</Text>
          </View>

          <View style={{ gap: spacing.md }}>
            <View style={divider} />
            {knownDuration && duration !== undefined ? (
              <View style={{ gap: spacing.xs }}>
                {activeSeek ? (
                  <PlaybackSeek {...activeSeek} enabled={!disabled} label={`Playback position for ${title}`} />
                ) : (
                  <View accessibilityElementsHidden style={{ minHeight: 32, justifyContent: 'center' }}>
                    <View style={{ height: 4, borderRadius: spacing.xs, backgroundColor: palette.border }} />
                  </View>
                )}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm }}>
                  <Text accessibilityLabel={`Elapsed ${elapsed}`} style={timeStyle}>{elapsed}</Text>
                  <Text accessibilityLabel={`Duration ${knownDuration}`} style={timeStyle}>{formatRecordingTime(duration)}</Text>
                </View>
              </View>
            ) : <Text style={metadataStyle}>Duration unknown</Text>}
            <View style={{ alignItems: 'center' }}>
              <Host matchContents colorScheme={mode}>
                <Button onPress={onTogglePlayback} modifiers={[buttonStyle('plain'), nativeDisabled(disabled), accessibilityLabel(`${action} ${title}`)]}>
                  <Image systemName={playing ? 'pause.fill' : 'play.fill'} modifiers={[
                    font({ size: 26 }), foregroundStyle(disabled ? palette.muted : palette.onAccent),
                    frame({ width: 60, height: 60 }), background(disabled ? palette.surface : palette.accent, shapes.circle()),
                  ]} />
                </Button>
              </Host>
            </View>
            {message ? <Text selectable style={[typography.body, { color: palette.text }]}>{message}</Text> : null}
          </View>

          <View>
            <View style={divider} />
            <IOSDetailAction label="Share audio" title={title} symbol="square.and.arrow.up"
              disabled={disabled || shareDisabled} onPress={onShare} />
            {documents ? <IOSDetailAction label={documents.transcript} title={title} symbol="doc.text"
              disabled={disabled} onPress={onTranscript} /> : null}
            {documents?.summary ? <IOSDetailAction label="Open summary" title={title} symbol="list.bullet.rectangle"
              disabled={disabled} onPress={onSummary} /> : null}
          </View>
        </ScrollView>
      </DetailShell>
    </Modal>
  );
}

export function RecordingDetail(props: RecordingDetailProps) {
  return Platform.OS === 'ios' ? <IOSRecordingDetail {...props} /> : <DefaultRecordingDetail {...props} />;
}

function DefaultRecordingDetail({
  recording, playing, seek, message, disabled, shareDisabled, onBack, onTogglePlayback, onShare, onTranscript,
}: RecordingDetailProps) {
  const { palette, spacing, typography } = useTheme();
  const activeSeek = seek && Number.isFinite(seek.max) && seek.max > 0 ? seek : undefined;
  const duration = knownRecordingDuration(recording.durationSeconds) ?? recordingDuration(activeSeek?.max);
  const action = playing ? 'Pause' : 'Play';

  return (
    <Modal onRequestClose={onBack}>
      <DetailShell title="Recording details" backLabel="Back to Library" onBack={onBack}>
        <ScrollView
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        >
          <Text
            accessibilityRole="header"
            selectable
            textBreakStrategy="simple"
            style={[typography.title, { color: palette.text }]}
          >
            {recording.label}
          </Text>
          {activeSeek ? (
            <View style={{ gap: spacing.xs }}>
              <PlaybackSeek {...activeSeek} enabled={!disabled} label={`Playback position for ${recording.label}`} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm }}>
                <Text style={[typography.body, { color: palette.text, fontVariant: ['tabular-nums'] }]}>
                  {formatRecordingTime(activeSeek.value)}
                </Text>
                <Text style={[typography.body, { color: palette.muted, fontVariant: ['tabular-nums'] }]}>
                  {duration}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={[typography.body, { color: palette.muted }]}>{duration}</Text>
          )}
          {message ? (
            <Text accessibilityLiveRegion="polite" selectable style={[typography.body, { color: palette.text }]}>
              {message}
            </Text>
          ) : null}
          <RecordingActions
            label={recording.label}
            disabled={disabled}
            shareDisabled={shareDisabled}
            onShare={onShare}
            onTranscript={onTranscript}
          />
        </ScrollView>
        <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: palette.border }}>
          <ActionButton
            title={action}
            accessibilityLabel={`${action} ${recording.label}`}
            variant="primary"
            disabled={disabled}
            onPress={onTogglePlayback}
          />
        </View>
      </DetailShell>
    </Modal>
  );
}
