import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, ScrollView, Text, View } from 'react-native';
import { Host, ListItem, Text as NativeText } from '@expo/ui';
import { ActionButton } from './ActionButton';
import { RecordControl } from './RecordControl';
import type { CapturePhase } from './navigation';
import { hasSavedFeedback } from './recordFeedback';
import { formatRecordingTime, knownRecordingDuration, recordingDate, recordingTimeLabel, type RecordingSummary } from './recording-display';
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

export function RecordView({
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
