import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Host, ListItem, Text as NativeText } from '@expo/ui';
import { ActionButton } from './ActionButton';
import { RecordControl } from './RecordControl';
import type { CapturePhase } from './navigation';
import { hasSavedFeedback } from './recordFeedback';
import { formatRecordingTime, knownRecordingDuration, recordingDate, recordingRowText, recordingTimeLabel, type RecordingSummary } from './recording-display';
import { useTheme } from './theme';

export type RecordViewProps = {
  phase: CapturePhase;
  message: string;
  durationMillis: number;
  savedUri?: string;
  savedRecording?: RecordingSummary;
  onPressRecord: () => void;
  onViewInLibrary: () => void;
};

function IOSRecordView({
  phase, message, durationMillis, savedUri, savedRecording, onPressRecord, onViewInLibrary,
}: RecordViewProps) {
  const { palette, spacing, typography } = useTheme();
  const [viewportHeight, setViewportHeight] = useState(0);
  const recording = phase === 'recording';
  const saved = hasSavedFeedback(phase, savedUri, message);
  const savedItem = savedRecording?.uri === savedUri ? savedRecording : undefined;
  const savedText = savedItem && recordingRowText(savedItem.label, recordingDate(savedItem.createdAt));
  const savedDuration = knownRecordingDuration(savedItem?.durationSeconds);
  const elapsed = formatRecordingTime(durationMillis / 1000);
  const muted = [typography.body, { color: palette.muted, textAlign: 'center' as const }];

  useEffect(() => {
    if (saved) AccessibilityInfo.announceForAccessibility('Last recording saved');
  }, [saved, savedUri]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      onLayout={({ nativeEvent }) => setViewportHeight(nativeEvent.layout.height)}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: spacing.xxl,
        // Center the existing 144-point circle just above the middle of the viewport.
        paddingTop: Math.max(spacing.xxl, viewportHeight * 0.45 - 72 - spacing.sm),
        paddingBottom: spacing.xxl,
        gap: spacing.lg,
      }}
    >
      <View style={{ alignItems: 'center' }}>
        <RecordControl phase={phase} onPress={onPressRecord} />
      </View>
      {recording ? (
        <View style={{ alignItems: 'center', gap: spacing.xs }}>
          <Text style={muted}>Recording</Text>
          <Text
            accessibilityLabel={`Recording duration ${elapsed}`}
            style={[typography.title, { color: palette.text, fontVariant: ['tabular-nums'], textAlign: 'center' }]}
          >
            {elapsed}
          </Text>
        </View>
      ) : null}
      {saved ? (
        <Pressable
          testID="last-recording-saved"
          accessibilityRole="button"
          accessibilityLabel={['View in Library', 'Last recording saved', savedText?.title, savedText?.time, savedDuration].filter(Boolean).join(', ')}
          onPress={onViewInLibrary}
          style={({ pressed }) => ({
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: palette.border,
            backgroundColor: pressed ? palette.surface : undefined,
            minHeight: 48,
            paddingVertical: spacing.md,
            gap: spacing.xs,
          })}
        >
          <Text style={[typography.dayLabel, { color: palette.muted }]}>Last recording saved</Text>
          {savedText ? (
            <Text style={[typography.body, { color: palette.text }]}>{savedText.title}</Text>
          ) : null}
          {savedText?.time || savedDuration ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {savedText?.time ? <Text style={[typography.caption, { color: palette.muted }]}>{savedText.time}</Text> : null}
              {savedDuration ? <Text style={[typography.caption, { color: palette.muted }]}>{savedDuration}</Text> : null}
            </View>
          ) : null}
          <Text style={[typography.body, { color: palette.accent }]}>View in Library</Text>
        </Pressable>
      ) : message ? (
        <Text selectable style={muted}>{message}</Text>
      ) : phase === 'idle' ? (
        <Text style={muted}>Recordings are stored on this device.</Text>
      ) : null}
    </ScrollView>
  );
}

export function RecordView(props: RecordViewProps) {
  return Platform.OS === 'ios' ? <IOSRecordView {...props} /> : <DefaultRecordView {...props} />;
}

function DefaultRecordView({
  phase, message, durationMillis, savedUri, savedRecording, onPressRecord, onViewInLibrary,
}: RecordViewProps) {
  const { mode, palette, spacing, typography } = useTheme();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [controlHeight, setControlHeight] = useState(0);
  const [statusHeight, setStatusHeight] = useState(0);
  const recording = phase === 'recording';
  const saved = hasSavedFeedback(phase, savedUri, message);
  const android = Platform.OS === 'android';
  useEffect(() => {
    if (android && saved) AccessibilityInfo.announceForAccessibility('Last recording saved');
  }, [android, saved, savedUri]);
  const savedDate = recordingDate(savedRecording?.createdAt);
  const savedTime = savedDate ? recordingTimeLabel(savedDate, 'minute') : undefined;
  const savedDuration = knownRecordingDuration(savedRecording?.durationSeconds);
  const elapsed = formatRecordingTime(durationMillis / 1000);
  const heading = [typography.heading, { color: palette.text, textAlign: 'center' as const }];
  const hasStatus = recording || Boolean(message && !saved);
  // Reserve room for the status above the Android button without shifting the capture target.
  const anchor = (viewportHeight - controlHeight) * (android ? 0.45 : 0.5);
  const top = Math.max(spacing.xxl, anchor - (android && hasStatus ? statusHeight + spacing.md : 0));

  return (
    <ScrollView
      style={{ flex: 1 }}
      onLayout={({ nativeEvent }) => setViewportHeight(nativeEvent.layout.height)}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: spacing.xxl,
        paddingTop: top,
        paddingBottom: spacing.xxl,
        gap: spacing.lg,
      }}
    >
      <View
        onLayout={android ? undefined : ({ nativeEvent }) => setControlHeight(nativeEvent.layout.height)}
        style={{ alignItems: 'center', gap: spacing.md }}
      >
        {hasStatus ? <View style={{ alignItems: 'center', gap: spacing.md }}
          onLayout={android ? ({ nativeEvent }) => setStatusHeight(nativeEvent.layout.height) : undefined}>
          <Text accessibilityLiveRegion="polite" style={android ? [typography.dayLabel, { color: palette.muted }] : heading}>
            {recording ? 'Recording' : message}
          </Text>
          {recording ? (
          <>
            <Text
              selectable
              accessibilityLabel={`Recording duration ${elapsed}`}
              style={{ color: palette.text, fontSize: 48, lineHeight: 56, fontVariant: ['tabular-nums'], fontWeight: '500' }}
            >
              {elapsed}
            </Text>
            {message ? (
              <Text accessibilityLiveRegion="polite" style={[typography.body, { color: palette.text, textAlign: 'center' }]}>
                {message}
              </Text>
            ) : null}
          </>
          ) : null}
        </View> : null}
        <View onLayout={android ? ({ nativeEvent }) => setControlHeight(nativeEvent.layout.height) : undefined}>
          <RecordControl phase={phase} onPress={onPressRecord} />
        </View>
      </View>
      {saved && android ? (
        <View style={{ marginTop: spacing.xxxl, borderTopWidth: 1, borderTopColor: palette.border }}>
          <Host matchContents={{ vertical: true }} colorScheme={mode}>
            <ListItem onPress={onViewInLibrary} testID="last-recording-saved"
              colors={{ containerColor: palette.background, contentColor: palette.text, supportingContentColor: palette.muted }}
              supportingText={[savedTime, savedDuration].filter(Boolean).join(' · ') || undefined}
              trailing={<NativeText textStyle={{ color: palette.accent }}>View in Library</NativeText>}>
              <NativeText textStyle={{ fontWeight: '600' }}>Last recording saved</NativeText>
            </ListItem>
          </Host>
        </View>
      ) : saved ? (
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityLiveRegion="polite" style={heading}>{message}</Text>
          <ActionButton title="View in Library" variant="tonal" onPress={onViewInLibrary} />
        </View>
      ) : android && recording ? null : (
        <Text style={[typography.body, { color: palette.muted, textAlign: 'center' }]}>
          {Platform.OS === 'web'
            ? 'Recording and file import are available in the Android and iOS apps. This browser supports Record, Library and Settings navigation.'
            : 'Recordings are stored on this device.'}
        </Text>
      )}
    </ScrollView>
  );
}
