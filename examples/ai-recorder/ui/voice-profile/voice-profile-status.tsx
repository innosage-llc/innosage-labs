import { Text, View } from 'react-native';
import type { VoiceSegment } from '../../ProClient';
import { ActionButton } from '../ActionButton';
import { useTheme } from '../theme';

export type VoiceProfileReview = {
  matchedCount: number;
  reviewCount: number;
  unknownCount: number;
  reviewBySpeaker: ReadonlyMap<string, number>;
};

export function summarizeVoiceProfileResult(segments: readonly VoiceSegment[]): VoiceProfileReview {
  let matchedCount = 0;
  let reviewCount = 0;
  let unknownCount = 0;
  const reviewBySpeaker = new Map<string, number>();
  for (const { disposition, speakerId } of segments) {
    if (disposition === 'matched') matchedCount++;
    else if (disposition === 'unknown') unknownCount++;
    else {
      reviewCount++;
      const speaker = /^SPEAKER_0([1-8])$/.exec(speakerId ?? '');
      const label = speaker ? `Speaker ${speaker[1]}` : 'Unknown speaker';
      reviewBySpeaker.set(label, (reviewBySpeaker.get(label) ?? 0) + 1);
    }
  }
  return { matchedCount, reviewCount, unknownCount, reviewBySpeaker };
}

export type VoiceProfileStatusProps = {
  available: boolean;
  pending: boolean;
  matchedCount: number;
  reviewCount: number;
  unknownCount: number;
  expandedReview?: VoiceProfileReview['reviewBySpeaker'];
  onReview: () => void;
};

export function VoiceProfileStatus({
  available,
  pending,
  matchedCount,
  reviewCount,
  unknownCount,
  expandedReview,
  onReview,
}: VoiceProfileStatusProps) {
  const { palette, spacing, typography } = useTheme();
  const hasResult = available && !pending;
  const canReview = hasResult && reviewCount > 0;
  const showCounts = hasResult && (matchedCount > 0 || reviewCount > 0 || unknownCount > 0);

  let status = 'No voice matches found. The transcript stays anonymous.';
  if (pending) {
    status = 'Voice matching is in progress. The transcript stays anonymous.';
  } else if (!available) {
    status = 'Voice matching is unavailable. The transcript stays anonymous.';
  } else if (canReview) {
    status = 'Voice matching results are ready to review.';
  } else if (matchedCount > 0) {
    status = 'Voice matches found. The transcript stays anonymous.';
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityLiveRegion="polite" style={{ ...typography.body, color: palette.muted }}>
        {status}
      </Text>
      {showCounts ? (
        <Text selectable style={{ ...typography.caption, color: palette.muted, fontVariant: ['tabular-nums'] }}>
          {`Segments · ${matchedCount} matched · ${reviewCount} to review · ${unknownCount} unknown`}
        </Text>
      ) : null}
      {canReview ? <ActionButton title={expandedReview ? 'Hide voice review' : 'Review voice results'} onPress={onReview} /> : null}
      {canReview && expandedReview ? Array.from(expandedReview, ([label, count]) => (
        <Text key={label} style={{ ...typography.body, color: palette.muted }}>
          {`${label} · ${count} ${count === 1 ? 'segment' : 'segments'} to review`}
        </Text>
      )) : null}
    </View>
  );
}
