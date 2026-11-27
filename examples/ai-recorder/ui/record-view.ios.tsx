import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RecordControl } from './RecordControl';
import type { RecordViewProps } from './record-view';
import { hasSavedFeedback } from './recordFeedback';
import { formatRecordingTime, knownRecordingDuration, recordingDate, recordingRowText } from './recording-display';
import { useTheme } from './theme';

export function RecordView({
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
