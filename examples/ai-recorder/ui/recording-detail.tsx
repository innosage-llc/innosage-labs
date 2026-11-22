import { Modal, ScrollView, Text, View } from 'react-native';
import { PlaybackSeek } from '../PlaybackSeek';
import type { PlaybackSeekProps } from '../PlaybackSeek.types';
import { ActionButton } from './ActionButton';
import { DetailShell } from './DetailShell';
import { RecordingActions } from './recording-actions';
import { formatRecordingTime, recordingDuration, type RecordingSummary } from './recording-display';
import { useTheme } from './theme';

export type RecordingDetailProps = {
  recording: RecordingSummary;
  playing: boolean;
  seek?: Omit<PlaybackSeekProps, 'enabled' | 'label'>;
  message?: string;
  disabled: boolean;
  shareDisabled: boolean;
  onBack: () => void;
  onTogglePlayback: () => void;
  onShare: () => void;
  onTranscript: () => void;
};

export function RecordingDetail({
  recording, playing, seek, message, disabled, shareDisabled, onBack, onTogglePlayback, onShare, onTranscript,
}: RecordingDetailProps) {
  const { palette, spacing, typography } = useTheme();
  const activeSeek = seek && Number.isFinite(seek.max) && seek.max > 0 ? seek : undefined;
  const duration = recordingDuration(activeSeek?.max ?? recording.durationSeconds);
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
