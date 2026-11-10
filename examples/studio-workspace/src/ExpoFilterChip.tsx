import React from 'react';
import { Chip } from '../ui';

export interface ExpoFilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** iOS and Web keep the existing chip until Expo ships a universal FilterChip. */
export function ExpoFilterChip({ label, selected, onPress }: ExpoFilterChipProps) {
  return <Chip label={label} selected={selected} onPress={onPress} />;
}
