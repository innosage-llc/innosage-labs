import { ActionButton } from './ActionButton';

export type LibraryImportButtonProps = {
  importing: boolean;
  disabled: boolean;
  onPress: () => void;
};

export function LibraryImportButton({ importing, disabled, onPress }: LibraryImportButtonProps) {
  return (
    <ActionButton
      title={importing ? 'Importing…' : 'Import audio'}
      variant="text"
      fullWidth={false}
      disabled={disabled}
      onPress={onPress}
    />
  );
}

export function LibraryAudioIcon() {
  return null;
}
