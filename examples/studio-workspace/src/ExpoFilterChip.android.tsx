import React from 'react';
import { FilterChip, Host, Text } from '@expo/ui/jetpack-compose';
import { useTheme } from '../ui';
import type { ExpoFilterChipProps } from './ExpoFilterChip';

export function ExpoFilterChip({ label, selected, onPress }: ExpoFilterChipProps) {
  const { palette } = useTheme();
  return (
    <Host matchContents>
    <FilterChip
      selected={selected}
      onClick={onPress}
      colors={{
        containerColor: palette.surface,
        labelColor: palette.text,
        selectedContainerColor: palette.accent,
        selectedLabelColor: palette.onAccent,
      }}
    >
      <FilterChip.Label><Text>{label}</Text></FilterChip.Label>
    </FilterChip>
    </Host>
  );
}
