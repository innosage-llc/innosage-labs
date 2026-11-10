import React from 'react';
import {
  Host,
  ListItem as NativeListItem,
  Picker as NativePicker,
  type TextInputProps as ExpoTextInputProps,
} from '@expo/ui';
import { SegmentedControl as NativeSegmentedControl } from '@expo/ui/community/segmented-control';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { type SegmentOption, UiText, useTheme } from '../ui';

/**
 * SDK 58 adapters used by the Studio screens. Community SegmentedControl does
 * not expose Android accessibility labels or test IDs, and universal Picker
 * currently drops its test ID on Android; wrappers retain test IDs. Picker has
 * no accessible-label prop, so its visible label is adjacent rather than
 * programmatically associated. Expo TextInput does not expose aria-invalid, so
 * errors remain visible and are announced as alerts. Expo ListItem is reserved
 * for rows with one row-level action; custom row colors apply on Android only.
 * App navigation, destructive confirmations, multi-action cards, and persistent
 * feedback remain in the existing composition for separate audit slices.
 */

export interface ExpoSegmentsProps {
  options: readonly SegmentOption[];
  value: string;
  onChange: (id: string) => void;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function ExpoSegments({
  options,
  value,
  onChange,
  accessibilityLabel,
  testID,
  style,
}: ExpoSegmentsProps) {
  const { mode } = useTheme();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === value));

  return (
    <View testID={testID} style={[{ width: '100%' }, style]}>
      <NativeSegmentedControl
        style={{ width: '100%' }}
        values={options.map((option) => option.label)}
        selectedIndex={selectedIndex}
        onChange={(event) => {
          const selected = options[event.nativeEvent.selectedSegmentIndex];
          if (selected) onChange(selected.id);
        }}
        accessibilityLabel={accessibilityLabel}
        appearance={mode}
      />
    </View>
  );
}

export interface ExpoPickerOption {
  value: string;
  label: string;
}

export interface ExpoPickerProps {
  label: string;
  value: string;
  options: readonly ExpoPickerOption[];
  onValueChange: (value: string) => void;
  testID?: string;
}

export function ExpoPicker({ label, value, options, onValueChange, testID }: ExpoPickerProps) {
  return (
    <View style={{ gap: 4 }}>
      <UiText variant="caption" style={{ fontWeight: '600' }}>{label}</UiText>
      <View testID={testID}>
        <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
        <NativePicker
          selectedValue={value}
          onValueChange={(nextValue) => onValueChange(String(nextValue))}
        >
          {options.map((option) => (
            <NativePicker.Item key={option.value} value={option.value} label={option.label} />
          ))}
        </NativePicker>
      </Host>
      </View>
    </View>
  );
}

export interface ExpoListRowProps {
  title: string;
  subtitle?: string;
  onPress: () => void;
  testID?: string;
}

export function ExpoListRow({ title, subtitle, onPress, testID }: ExpoListRowProps) {
  const { palette } = useTheme();
  return (
    <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
        <NativeListItem
      testID={testID}
      onPress={onPress}
      supportingText={subtitle}
      colors={{
        containerColor: palette.surface,
        contentColor: palette.text,
        supportingContentColor: palette.muted,
      }}
    >
      {title}
    </NativeListItem>
      </Host>
  );
}
