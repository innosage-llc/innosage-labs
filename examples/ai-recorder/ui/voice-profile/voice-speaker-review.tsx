import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import {
  readManualVoiceCorrections, saveManualVoiceCorrection, type VoiceReviewRow, type VoiceSource,
} from '../../VoiceProfileReview';
import { ActionButton } from '../ActionButton';
import { useTheme } from '../theme';

type Binding = Parameters<typeof readManualVoiceCorrections>[2];
type Corrections = Awaited<ReturnType<typeof readManualVoiceCorrections>>;

async function originalBinding(originalUri: string, operationId: string): Promise<Binding> {
  const original = await new File(originalUri).arrayBuffer();
  const hash = await digest(CryptoDigestAlgorithm.SHA256, original);
  const originalSha256 = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
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

export function VoiceSpeakerReview({ originalUri, operationId, correctionKey, rows, namesUnavailable }: {
  originalUri: string;
  operationId: string;
  correctionKey: string;
  rows?: readonly VoiceReviewRow[];
  namesUnavailable?: boolean;
}) {
  const { palette, spacing, typography } = useTheme();
  const [saved, setSaved] = useState<{ binding: Binding; entries: Corrections } | null>();
  const [choice, setChoice] = useState<{ segmentId: string; label: string }>();
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const saveInProgress = useRef(false);

  useEffect(() => {
    let active = true;
    async function restoreCorrections() {
      const binding = await originalBinding(originalUri, operationId);
      const entries = await readManualVoiceCorrections(SecureStore, correctionKey, binding);
      if (active) setSaved({ binding, entries });
    }
    void restoreCorrections().catch(() => { if (active) setSaved(null); });
    return () => { active = false; };
  }, [originalUri, operationId, correctionKey]);

  async function saveCorrection(row: VoiceReviewRow) {
    if (!saved || !rows || !choice?.label.trim() || choice.segmentId !== row.segmentId || saveInProgress.current) return;
    saveInProgress.current = true;
    setSaving(true);
    setSaveFailed(false);
    try {
      const binding = await originalBinding(originalUri, operationId);
      if (binding.originalSha256 !== saved.binding.originalSha256) throw new Error('Original transcript changed.');
      const entries = await saveManualVoiceCorrection(SecureStore, correctionKey, binding, rows, {
        speakerId: row.speakerId, label: choice.label, confirmedLocalOnly: true,
      });
      setSaved({ binding, entries });
      setChoice(undefined);
    } catch {
      setSaveFailed(true);
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  }

  const entries = saved?.entries ?? [];
  const items = [
    ...(rows ?? []).map(row => ({
      source: row, live: row, correction: entries.find(entry => sameSource(entry.source, row))?.label,
    })),
    ...entries.filter(entry => !rows?.some(row => sameSource(entry.source, row)))
      .map(entry => ({ source: entry.source, live: undefined, correction: entry.label })),
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
        const selected = !!live && choice?.segmentId === source.segmentId;
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
              {`Saved local correction: ${correction}`}
            </Text> : null}
            {live && saved && !selected ? <ActionButton title={`Correct ${speaker} locally`} disabled={saving} onPress={() => {
              setSaveFailed(false);
              setChoice({ segmentId: source.segmentId, label: '' });
            }} /> : null}
            {live && selected ? <View style={{ gap: spacing.xs }}>
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
                onPress={() => { void saveCorrection(live); }} />
            </View> : null}
          </View>
        );
      })}
    </View>
  );
}
