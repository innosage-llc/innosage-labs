import { Host, Checkbox as NativeCheckbox } from '@expo/ui';

export interface ExpoCheckboxProps {
  value: boolean;
  label: string;
  onValueChange: (value: boolean) => void;
  testID?: string;
}

export function ExpoCheckbox({ value, label, onValueChange, testID }: ExpoCheckboxProps) {
  return <Host matchContents><NativeCheckbox value={value} label={label} onValueChange={onValueChange} testID={testID} /></Host>;
}
