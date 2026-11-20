import { View } from 'react-native';
import { ActionButton } from './ActionButton';

type Props = {
  label: string;
  disabled: boolean;
  shareDisabled: boolean;
  onTranscript: () => void;
  onShare?: () => void;
};

export function RecordingActions({ label, disabled, shareDisabled, onTranscript, onShare }: Props) {
  const transcript = (
    <ActionButton
      title="Transcript"
      fullWidth={false}
      accessibilityLabel={`Transcript for ${label}`}
      variant="text"
      disabled={disabled}
      onPress={onTranscript}
    />
  );

  if (!onShare) return transcript;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {transcript}
      <ActionButton
        title="Share audio"
        fullWidth={false}
        accessibilityLabel={`Share audio for ${label}`}
        variant="text"
        disabled={disabled || shareDisabled}
        onPress={onShare}
      />
    </View>
  );
}
