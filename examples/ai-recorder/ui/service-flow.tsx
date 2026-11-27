import type { ReactNode } from 'react';
import type { ServiceId } from '../ServiceConfig';

export type SettingsEntryProps = {
  serviceLabel: string;
  disabled: boolean;
  onOpen: () => void;
};

export type ServiceSettingsLayoutProps = {
  service: ServiceId | undefined;
  serviceLabel: string;
  stagingAvailable: boolean;
  managingKeys: boolean;
  canConfigureKey: boolean;
  busy: boolean;
  message: string;
  keys: ReactNode;
  onChange: (id: ServiceId) => void;
  onOpenKeys: () => void;
  onBack: () => void;
};

export type TranscriptSetupProps = {
  title: string;
  metadata: string;
  message: string;
  children: ReactNode;
};

// Callers route iOS alone into the native screens.
export function SettingsEntry(_props: SettingsEntryProps) { return null; }
export function ServiceSettingsLayout(_props: ServiceSettingsLayoutProps) { return null; }
export function TranscriptSetup(_props: TranscriptSetupProps) { return null; }
