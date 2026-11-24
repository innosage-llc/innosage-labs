import { Text, View } from 'react-native';
import { ActionButton } from '../ActionButton';
import { useTheme } from '../theme';

export type VoiceProfileStatusProps = {
  available: boolean;
  pending: boolean;
  matchedCount: number;
  reviewCount: number;
  unknownCount: number;
  onReview: () => void;
};

export function VoiceProfileStatus({
  available,
  pending,
  matchedCount,
  reviewCount,
  unknownCount,
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
      {canReview ? <ActionButton title="Review voice results" onPress={onReview} /> : null}
      {showCounts ? (
        <Text selectable style={{ ...typography.caption, color: palette.muted, fontVariant: ['tabular-nums'] }}>
          {`Segments · ${matchedCount} matched · ${reviewCount} to review · ${unknownCount} unknown`}
        </Text>
      ) : null}
    </View>
  );
}
