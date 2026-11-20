type Props = {
  serviceLabel: string;
  loading: boolean;
  serviceReady: boolean;
  canUseFree: boolean;
  supportsPro: boolean;
  usePro: boolean;
  canChoosePro: boolean;
  proDenied: boolean;
  isProduction: boolean;
  hasOperation: boolean;
  jobState?: string;
  operationEnded: boolean;
  operationPending: boolean;
  statusUnknown: boolean;
  identifySpeakers: boolean;
  canChooseSpeakers: boolean;
  busy: boolean;
  onUsePro(value: boolean): void;
  onIdentifySpeakers(value: boolean): void;
  onRetryService(): void;
  onCheckStatus(): void;
  onTranscribe(): void;
};

export function InnoSageTranscriptAction(_props: Props) {
  return null;
}
