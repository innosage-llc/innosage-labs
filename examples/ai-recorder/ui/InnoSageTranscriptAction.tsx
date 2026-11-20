import { ActivityIndicator, Text, View } from 'react-native';
import { RecorderSwitch } from '../RecorderSwitch';
import { ActionButton } from './ActionButton';
import { useTheme } from './theme';

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

export function InnoSageTranscriptAction({
  serviceLabel, loading, serviceReady, canUseFree, supportsPro, usePro,
  canChoosePro, proDenied, isProduction, hasOperation, jobState, operationEnded,
  operationPending, statusUnknown, identifySpeakers, canChooseSpeakers, busy,
  onUsePro, onIdentifySpeakers, onRetryService, onCheckStatus, onTranscribe,
}: Props) {
  const { palette, spacing, typography } = useTheme();
  const body = { ...typography.body, color: palette.text };
  const muted = { ...typography.body, color: palette.muted };
  const row = { flexDirection: 'row', alignItems: 'center', gap: spacing.sm } as const;
  const rowText = { flex: 1 };

  if (loading) {
    return (
      <View style={row}>
        <ActivityIndicator color={palette.accent} />
        <Text accessibilityLiveRegion="polite" style={[muted, rowText]}>Loading transcription settings…</Text>
      </View>
    );
  }

  const lockedJob = hasOperation && !operationEnded;
  // Transcript exposes RESERVED as "Ready to upload".
  const canResumeUpload = lockedJob && jobState === 'Ready to upload';
  const checkOnly = operationPending || statusUnknown || (lockedJob && !canResumeUpload);
  const proUnavailable = !supportsPro && (usePro || isProduction);
  const freeUnavailable = !usePro && !canUseFree;
  const canUpload = serviceReady && !checkOnly && !proUnavailable && !freeUnavailable;
  const canChangeOptions = !lockedJob && !checkOnly && !busy;
  const showProSwitch = supportsPro && !proDenied && (canChoosePro || lockedJob || usePro);
  const showUseFree = proDenied && canChoosePro && canChangeOptions && serviceReady;
  const limit = usePro ? 'Pro supports up to 4 hours and 512 MiB.' : 'Free supports up to 15 minutes and 50 MB.';
  const savedStatus = statusUnknown ? 'Status unknown'
    : jobState ?? (serviceReady ? 'Checking saved transcription…' : 'Saved transcription');

  let uploadTitle = 'Transcribe';
  if (operationEnded) uploadTitle = 'Start new transcription';
  else if (canResumeUpload) uploadTitle = 'Resume upload';
  else if (proDenied) uploadTitle = 'Retry Pro';

  return (
    <View style={{ gap: spacing.md }}>
      {serviceReady || hasOperation ? (
        <View style={{ gap: spacing.xs }}>
          <Text accessibilityRole="header" style={[typography.heading, { color: palette.text }]}>{serviceLabel}</Text>
          {hasOperation ? (
            <>
              <Text accessibilityLiveRegion="polite" style={body}>{savedStatus}</Text>
              <Text style={muted}>This job keeps its original service.</Text>
            </>
          ) : null}
        </View>
      ) : null}

      {!serviceReady ? (
        <Text accessibilityLiveRegion="polite" selectable style={body}>Could not read transcription settings.</Text>
      ) : null}
      {checkOnly ? (
        <Text style={muted}>
          {statusUnknown ? 'Check the same operation to recover its status.' : 'Check the same operation for an update.'}
        </Text>
      ) : null}
      {serviceReady && !checkOnly && (freeUnavailable || proUnavailable) ? (
        <View style={{ gap: spacing.xs }}>
          {freeUnavailable ? (
            <Text style={body}>
              {isProduction ? 'Free transcription is unavailable in Production.' : 'Free transcription is unavailable in this build.'}
            </Text>
          ) : null}
          {proUnavailable ? <Text style={body}>Pro uploads are unavailable on iOS.</Text> : null}
          {isProduction && !proUnavailable ? <Text style={muted}>A Production Pro key is required.</Text> : null}
        </View>
      ) : null}

      {canUpload ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={body}>Transcribing uploads this M4A recording to InnoSage.</Text>
          <Text style={muted}>{limit}</Text>
        </View>
      ) : null}

      {canUpload || (serviceReady && hasOperation) ? (
        <View style={{ gap: spacing.xs }}>
          {showProSwitch ? (
            <View style={row}>
              <Text style={[body, rowText]}>Use Pro</Text>
              <RecorderSwitch label="Use Pro" value={usePro}
                enabled={canChoosePro && canChangeOptions} onCheckedChange={onUsePro} />
            </View>
          ) : null}
          <View style={row}>
            <Text style={[body, rowText]}>Identify speakers</Text>
            <RecorderSwitch label="Identify speakers" value={identifySpeakers}
              enabled={canUpload && canChooseSpeakers && canChangeOptions} onCheckedChange={onIdentifySpeakers} />
          </View>
        </View>
      ) : null}

      {busy ? (
        <View style={row}>
          <ActivityIndicator color={palette.accent} />
          <Text accessibilityLiveRegion="polite" style={[muted, rowText]}>
            {checkOnly ? 'Checking status…' : 'Submitting recording…'}
          </Text>
        </View>
      ) : checkOnly ? (
        <ActionButton title="Check status" variant="primary" onPress={onCheckStatus} />
      ) : !serviceReady ? (
        <ActionButton title="Retry" variant="primary" onPress={onRetryService} />
      ) : canUpload ? (
        <ActionButton title={uploadTitle} variant="primary" onPress={onTranscribe} />
      ) : null}
      {showUseFree ? <ActionButton title="Use Free" variant="outlined" onPress={() => onUsePro(false)} /> : null}
    </View>
  );
}
