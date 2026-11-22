import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ActionButton } from './ActionButton';
import { RecordControl } from './RecordControl';
import type { CapturePhase } from './navigation';
import { hasSavedFeedback } from './recordFeedback';
import { formatRecordingTime } from './recording-display';
import { useTheme } from './theme';

export type RecordViewProps = {
  phase: CapturePhase;
  message: string;
  durationMillis: number;
  savedUri?: string;
  onPressRecord: () => void;
  onViewInLibrary: () => void;
};

export function RecordView({
  phase, message, durationMillis, savedUri, onPressRecord, onViewInLibrary,
}: RecordViewProps) {
  const { palette, spacing, typography } = useTheme();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [controlHeight, setControlHeight] = useState(0);
  const recording = phase === 'recording';
  const saved = hasSavedFeedback(phase, savedUri, message);
  const elapsed = formatRecordingTime(durationMillis / 1000);
  const heading = [typography.heading, { color: palette.text, textAlign: 'center' as const }];
  // Center the control region independently of feedback below it. The footer stays in scroll flow.
  const top = Math.max(spacing.xxl, (viewportHeight - controlHeight) / 2);

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
        onLayout={({ nativeEvent }) => setControlHeight(nativeEvent.layout.height)}
        style={{ alignItems: 'center', gap: spacing.md }}
      >
        {recording || (message && !saved) ? (
          <Text accessibilityLiveRegion="polite" style={heading}>{recording ? 'Recording' : message}</Text>
        ) : null}
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
        <RecordControl phase={phase} onPress={onPressRecord} />
      </View>
      {saved ? (
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityLiveRegion="polite" style={heading}>{message}</Text>
          <ActionButton title="View in Library" variant="tonal" onPress={onViewInLibrary} />
        </View>
      ) : (
        <Text style={[typography.body, { color: palette.muted, textAlign: 'center' }]}>
          Recordings are stored on this device.
        </Text>
      )}
    </ScrollView>
  );
}
