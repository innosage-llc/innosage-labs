import { ActionButton } from './ActionButton';

type Props = {
  label: string;
  disabled: boolean;
  shareDisabled: boolean;
  onTranscript: () => void;
  onShare?: () => void;
};

export function RecordingActions({ label, disabled, onTranscript }: Props) {
  return <ActionButton title="Transcript" fullWidth={false} accessibilityLabel={`Transcript for ${label}`}
    variant="text" disabled={disabled} onPress={onTranscript} />;
}
