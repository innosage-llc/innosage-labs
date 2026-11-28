import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { hashRecording } from '../../ProAccess';
import {
  editSavedVoiceCorrection, readManualVoiceCorrections, saveManualVoiceCorrection,
  type VoiceReviewRow, type VoiceSource,
} from '../../VoiceProfileReview';
import { ActionButton } from '../ActionButton';
import { useTheme } from '../theme';

type Binding = Parameters<typeof readManualVoiceCorrections>[2];
type Corrections = Awaited<ReturnType<typeof readManualVoiceCorrections>>;
type CorrectionChoice = { kind: 'new' | 'edit'; source: VoiceSource; label: string };

async function originalBinding(originalUri: string, operationId: string, signal: AbortSignal): Promise<Binding> {
  signal.throwIfAborted();
  const originalSha256 = await hashRecording(new File(originalUri), signal);
  return { operationId, originalSha256 };
}

function sameSource(left: VoiceSource, right: VoiceSource) {
  return left.speakerId === right.speakerId && left.segmentId === right.segmentId &&
    left.startMs === right.startMs && left.endMs === right.endMs;
}

function sourceTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const second = String(seconds % 60).padStart(2, '0');
  const fraction = String(milliseconds % 1000).padStart(3, '0');
  const minute = hours ? `${hours}:${String(minutes % 60).padStart(2, '0')}` : String(minutes);
  return `${minute}:${second}.${fraction}`;
}

type VoiceSpeakerReviewProps = {
  originalUri: string;
  operationId: string;
  correctionKey: string;
  rows?: readonly VoiceReviewRow[];
  namesUnavailable?: boolean;
};

export function VoiceSpeakerReview(props: VoiceSpeakerReviewProps) {
  const { originalUri, operationId, correctionKey } = props;
  return <RecordingSpeakerReview key={JSON.stringify([originalUri, operationId, correctionKey])} {...props} />;
}

function RecordingSpeakerReview({ originalUri, operationId, correctionKey, rows, namesUnavailable }: VoiceSpeakerReviewProps) {
  const { palette, spacing, typography } = useTheme();
  const [saved, setSaved] = useState<{ binding: Binding; entries: Corrections } | null>();
  const [choice, setChoice] = useState<CorrectionChoice>();
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const saveInProgress = useRef(false);
  const sourceController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    sourceController.current = controller;
    const { signal } = controller;
    async function restoreCorrections() {
      const binding = await originalBinding(originalUri, operationId, signal);
      signal.throwIfAborted();
      const entries = await readManualVoiceCorrections(SecureStore, correctionKey, binding);
      if (!signal.aborted) setSaved({ binding, entries });
    }
    void restoreCorrections().catch(() => { if (!signal.aborted) setSaved(null); });
    return () => {
      controller.abort();
      sourceController.current = null;
    };
  }, [originalUri, operationId, correctionKey]);

  async function saveCorrection() {
    const signal = sourceController.current?.signal;
    if (!signal || signal.aborted || !saved || !choice?.label.trim() || saveInProgress.current) return;
    const { kind, source, label } = choice;
    const verifiedRows = rows ?? [];
    if (kind === 'new' && !verifiedRows.some(row => sameSource(row, source))) return;
    saveInProgress.current = true;
    setSaving(true);
    setSaveFailed(false);
    try {
      const binding = await originalBinding(originalUri, operationId, signal);
      signal.throwIfAborted();
      if (binding.operationId !== saved.binding.operationId || binding.originalSha256 !== saved.binding.originalSha256)
        throw new Error('Original transcript changed.');
      const entries = kind === 'edit'
        ? await editSavedVoiceCorrection(SecureStore, correctionKey, binding, {
          source, label, confirmedLocalOnly: true,
        })
        : await saveManualVoiceCorrection(SecureStore, correctionKey, binding, verifiedRows, {
          speakerId: source.speakerId, label, confirmedLocalOnly: true,
        });
      if (signal.aborted) return;
      setSaved({ binding, entries });
      setChoice(undefined);
    } catch {
      if (!signal.aborted) setSaveFailed(true);
    } finally {
      saveInProgress.current = false;
      if (!signal.aborted) setSaving(false);
    }
  }

  const entries = saved?.entries ?? [];
  const items = [
    ...(rows ?? []).map(row => ({
      source: row, live: row, correction: entries.find(entry => sameSource(entry.source, row)),
    })),
    ...entries.filter(entry => !rows?.some(row => sameSource(entry.source, row)))
      .map(entry => ({ source: entry.source, live: undefined, correction: entry })),
  ];
  if (!items.length && !namesUnavailable && saved !== null) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ ...typography.body, color: palette.text, fontWeight: '600' }}>Speaker review</Text>
      {namesUnavailable ? <Text accessibilityLiveRegion="polite" style={{ ...typography.body, color: palette.muted }}>
        Current profile names are unavailable.
      </Text> : null}
      {saved === null ? <Text accessibilityLiveRegion="polite" style={{ ...typography.body, color: palette.muted }}>
        Could not open local speaker corrections.
      </Text> : null}
      {items.map(({ source, live, correction }) => {
        const speaker = `Speaker ${source.speakerId.slice(-1)}`;
        const selected = choice && sameSource(choice.source, source) && (choice.kind === 'edit' ? !!correction : !!live);
        return (
          <View key={`${source.speakerId}:${source.segmentId}:${source.startMs}:${source.endMs}`}
            style={{ borderTopWidth: 1, borderColor: palette.border, paddingTop: spacing.sm, gap: spacing.xs }}>
            <Text style={{ ...typography.body, color: palette.text, fontWeight: '600' }}>{speaker}</Text>
            <Text style={{ ...typography.caption, color: palette.muted, fontVariant: ['tabular-nums'] }}>
              {`Source ${sourceTime(source.startMs)}–${sourceTime(source.endMs)}`}
            </Text>
            {live ? <Text style={{ ...typography.body, color: palette.muted }}>
              {live.liveName ? `Unconfirmed suggestion: ${live.liveName}` : live.disposition === 'needs_review' ? 'Needs review' : 'Unknown match'}
            </Text> : null}
            {correction ? <Text accessibilityLiveRegion="polite" style={{ ...typography.body, color: palette.text }}>
              {`Saved local correction: ${correction.label}`}
            </Text> : null}
            {saved && (correction || live) && !selected ? <ActionButton
              title={correction ? 'Edit local correction' : `Correct ${speaker} locally`} disabled={saving}
              onPress={() => {
                setSaveFailed(false);
                setChoice(correction
                  ? { kind: 'edit', source: correction.source, label: correction.label }
                  : { kind: 'new', source, label: '' });
              }} /> : null}
            {selected ? <View style={{ gap: spacing.xs }}>
              <Text style={{ ...typography.body, color: palette.text }}>Local speaker label</Text>
              <TextInput accessibilityLabel={`Local speaker label for ${speaker}`} value={choice?.label ?? ''}
                editable={!saving} autoComplete="off" autoCorrect={false} importantForAutofill="no"
                onChangeText={label => setChoice(current => current && { ...current, label })}
                style={{ ...typography.body, color: palette.text, borderColor: palette.border, borderWidth: 1, padding: spacing.sm }} />
              <Text style={{ ...typography.caption, color: palette.muted }}>Saving keeps this label on this device for this recording.</Text>
              {saveFailed ? <Text accessibilityLiveRegion="polite" style={{ ...typography.body, color: palette.text }}>
                Could not save the local correction.
              </Text> : null}
              <ActionButton title={saving ? 'Saving local correction…' : 'Save local correction'} disabled={saving || !choice?.label.trim()}
                onPress={() => { void saveCorrection(); }} />
            </View> : null}
          </View>
        );
      })}
    </View>
  );
}
