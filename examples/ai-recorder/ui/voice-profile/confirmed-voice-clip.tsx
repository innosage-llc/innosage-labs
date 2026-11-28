import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Text, TextInput, View, type TextStyle } from 'react-native';
import { readPendingConfirmedStageClip } from '../../ProAccess';
import type { ProOperation } from '../../ProClient';
import type { VoiceSource } from '../../VoiceProfileReview';
import { ActionButton } from '../ActionButton';
import { useTheme } from '../theme';

type ClipChoice = { kind: 'new' | 'resume'; source: VoiceSource };
export type ConfirmedVoiceClipSelection = ClipChoice & { displayName: string; participantConfirmed: true };
type ClipForm = ClipChoice & { displayName: string; participantConfirmed: boolean };

type Props = {
  operation: ProOperation;
  sources: readonly VoiceSource[];
  onSubmit: (selection: ConfirmedVoiceClipSelection, signal: AbortSignal) => Promise<void>;
};

function sourceTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const minute = hours ? `${hours}:${String(minutes % 60).padStart(2, '0')}` : String(minutes);
  return `${minute}:${String(seconds % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

function sourceRange({ startMs, endMs }: VoiceSource) {
  return `${sourceTime(startMs)}–${sourceTime(endMs)}`;
}

export function ConfirmedVoiceClip({ operation, sources, onSubmit }: Props) {
  const { palette, spacing, typography } = useTheme();
  const [pending, setPending] = useState<VoiceSource | 'unavailable' | null>();
  const [pendingCheck, setPendingCheck] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const [form, setForm] = useState<ClipForm>();
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<'saved' | 'unverified'>();
  const attempt = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    void readPendingConfirmedStageClip(operation).then(source => {
      if (active) setPending(source ?? null);
    }, () => {
      if (active) setPending('unavailable');
    });
    return () => { active = false; };
  }, [operation, pendingCheck]);

  useLayoutEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') return;
      attempt.current?.abort();
      setForm(undefined);
      setChoosing(false);
    });
    return () => {
      subscription.remove();
      attempt.current?.abort();
      attempt.current = null;
    };
  }, []);

  function refreshPending() {
    setPending(undefined);
    setPendingCheck(current => current + 1);
  }

  function chooseClip(kind: ClipChoice['kind'], source: VoiceSource) {
    setOutcome(undefined);
    setChoosing(false);
    setForm({ kind, source, displayName: '', participantConfirmed: false });
  }

  function closeForm() {
    Keyboard.dismiss();
    attempt.current?.abort();
    setForm(undefined);
    setChoosing(false);
  }

  const name = form?.displayName.trim() ?? '';
  const validName = !!name && [...name].length <= 100 && !/[\u0000-\u001f\u007f]/u.test(name);

  async function sendClip() {
    if (!form?.participantConfirmed || !validName || attempt.current || AppState.currentState !== 'active') return;
    const controller = new AbortController();
    attempt.current = controller;
    Keyboard.dismiss();
    setSending(true);
    setOutcome(undefined);

    let saved = false;
    try {
      await onSubmit({ kind: form.kind, source: form.source, displayName: name, participantConfirmed: true }, controller.signal);
      saved = true;
    } catch {
      // Check the local journal after the attempt settles so an interrupted send can only resume its saved slice.
    } finally {
      if (attempt.current === controller) {
        attempt.current = null;
        setForm(undefined);
        setSending(false);
        setOutcome(saved ? 'saved' : 'unverified');
        if (saved) setPending(null);
        else refreshPending();
      }
    }
  }

  const pendingClip = pending && pending !== 'unavailable' ? pending : undefined;
  const body = { ...typography.body, color: palette.text };
  const sourceStyle: TextStyle = { ...typography.caption, color: palette.muted, fontVariant: ['tabular-nums'] };
  if (!sending && !outcome && !pendingClip && !sources.length && pending !== 'unavailable') return null;

  let outcomeMessage: string | undefined;
  if (outcome === 'saved') {
    outcomeMessage = 'Voice profile created from the confirmed clip.';
  } else if (outcome === 'unverified') {
    if (pending === undefined) {
      outcomeMessage = 'Could not verify the save. Checking for a pending clip…';
    } else if (pending === 'unavailable') {
      outcomeMessage = 'Could not verify the save or check for a pending clip.';
    } else if (pending === null) {
      outcomeMessage = 'Could not verify the save. Check your saved voice profiles first.';
    } else {
      outcomeMessage = 'Could not verify the save. Resume the pending clip with the same profile name.';
    }
  }

  return (
    <View style={{ gap: spacing.xs }}>
      {outcomeMessage ? <Text selectable accessibilityLiveRegion="polite" style={body}>
        {outcomeMessage}
      </Text> : null}
      {!form && !sending && pending === 'unavailable' ? <>
        {outcome !== 'unverified' ? <Text accessibilityLiveRegion="polite" style={body}>Could not check for a pending clip.</Text> : null}
        <ActionButton title="Check pending clip" onPress={refreshPending} />
      </> : null}
      {!form && !sending && pendingClip ? <>
        <Text selectable style={sourceStyle}>{`Pending clip · ${sourceRange(pendingClip)}`}</Text>
        <ActionButton title="Resume pending clip" onPress={() => chooseClip('resume', pendingClip)} />
      </> : null}
      {!form && !sending && outcome !== 'unverified' && pending === null && sources.length > 0 ? (
        choosing ? <>
          <Text style={body}>Choose one reviewed segment from the original recording.</Text>
          {sources.map(source => <ActionButton key={source.segmentId} variant="outlined"
            title={`Speaker ${source.speakerId.slice(-1)} · ${sourceRange(source)}`} onPress={() => chooseClip('new', source)} />)}
          <ActionButton title="Cancel" variant="text" onPress={closeForm} />
        </> : <ActionButton title="Choose clip to enroll" onPress={() => { setOutcome(undefined); setChoosing(true); }} />
      ) : null}
      {form ? <>
        <Text selectable style={sourceStyle}>{`Selected clip · ${sourceRange(form.source)}`}</Text>
        <Text style={body}>{form.kind === 'resume' ? 'Enter the same profile name to resume this clip.' : 'Voice profile name'}</Text>
        <TextInput accessibilityLabel="Voice profile name" value={form.displayName} editable={!sending}
          autoComplete="off" importantForAutofill="no" autoCorrect={false} maxLength={200} returnKeyType="done"
          onChangeText={displayName => setForm(current => current && { ...current, displayName, participantConfirmed: false })}
          style={{ ...body, borderColor: palette.border, borderWidth: 1, padding: spacing.sm }} />
        {name && !validName ? <Text style={body}>Enter a profile name up to 100 characters.</Text> : null}
        <Text style={body}>Confirm you have the participant’s permission to send this exact clip to InnoSage and create a voice profile.</Text>
        <ActionButton title={form.participantConfirmed ? 'Withdraw confirmation' : 'Confirm participant permission'}
          variant="outlined" disabled={sending || !validName} onPress={() => {
            Keyboard.dismiss();
            setForm(current => current && { ...current, participantConfirmed: !current.participantConfirmed });
          }} />
        <ActionButton title={sending ? 'Sending clip…' : form.kind === 'resume' ? 'Resume sending this clip' : 'Send this clip'}
          variant="primary" disabled={sending || !form.participantConfirmed || !validName} onPress={() => { void sendClip(); }} />
        <ActionButton title="Cancel" variant="text" onPress={closeForm} />
      </> : null}
      {sending && !form ? <Text accessibilityLiveRegion="polite" style={body}>Checking the interrupted clip attempt…</Text> : null}
    </View>
  );
}
