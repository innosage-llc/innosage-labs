import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { ActionButton } from '../ActionButton';
import { DetailShell } from '../DetailShell';
import { useTheme } from '../theme';
import { pickVoiceClip, type VoiceProfileAudio } from './voice-profile-clip';

export type VoiceProfileManagerSummary = Readonly<{
  profileId: string;
  displayName: string;
  status: 'active' | 'disabled';
}>;

type Recovery = { pendingEnrollment: boolean; pendingDeletes: string[] };

export type VoiceProfileManagerProps = {
  onRestore: () => Promise<Recovery>;
  onList: () => Promise<readonly VoiceProfileManagerSummary[]>;
  onEnroll: (request: Readonly<{
    audio: VoiceProfileAudio;
    displayName: string;
    participantConfirmed: true;
  }>) => Promise<VoiceProfileManagerSummary>;
  onDelete: (profileId: string) => Promise<'pending' | 'deleted'>;
};

const busyMessages = {
  list: 'Loading voice profiles…',
  pick: 'Opening audio clip…',
  enroll: 'Sending audio clip…',
  delete: 'Checking deletion…',
};
type Operation = keyof typeof busyMessages;

export function VoiceProfileManager({ onRestore, onList, onEnroll, onDelete }: VoiceProfileManagerProps) {
  const { palette, spacing, typography } = useTheme();
  const [visible, setVisible] = useState(false);
  const [profiles, setProfiles] = useState<readonly VoiceProfileManagerSummary[]>([]);
  const [listState, setListState] = useState<'idle' | 'loaded' | 'unavailable'>('idle');
  const [clip, setClip] = useState<VoiceProfileAudio>();
  const [displayName, setDisplayName] = useState('');
  const [consent, setConsent] = useState(false);
  const [recovery, setRecovery] = useState<Recovery>();
  const [recoveryUnavailable, setRecoveryUnavailable] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<VoiceProfileManagerSummary>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<Operation>();
  const busyRef = useRef(false);

  const canMutate = !!recovery && !recoveryUnavailable;
  const pendingEnrollment = recovery?.pendingEnrollment === true;
  const pendingDeletes = new Set(recovery?.pendingDeletes);
  const name = displayName.trim();
  const canEnroll = canMutate && !!clip && consent && name.length > 0 && [...name].length <= 100;
  const body = { ...typography.body, color: palette.text };
  const muted = { ...typography.body, color: palette.muted };

  function begin(operation: Operation) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(operation);
    return true;
  }

  function finish() {
    busyRef.current = false;
    setBusy(undefined);
  }

  function clearDraft() {
    setClip(undefined);
    setDisplayName('');
    setConsent(false);
  }

  async function refreshRecovery() {
    try {
      const restored = await onRestore();
      setRecovery(restored);
      setRecoveryUnavailable(false);
      return restored;
    } catch {
      setRecoveryUnavailable(true);
    }
  }

  async function refresh() {
    if (!begin('list')) return;
    setMessage('');
    await refreshRecovery();
    try {
      setProfiles(await onList());
      setListState('loaded');
    } catch {
      setProfiles([]);
      setListState('unavailable');
    } finally {
      finish();
    }
  }

  function close() {
    if (busyRef.current) return;
    if (confirmDelete) {
      setConfirmDelete(undefined);
      return;
    }
    clearDraft();
    setProfiles([]);
    setListState('idle');
    setRecovery(undefined);
    setRecoveryUnavailable(false);
    setMessage('');
    setVisible(false);
  }

  async function chooseClip() {
    if (!canMutate || !begin('pick')) return;
    Keyboard.dismiss();
    try {
      const picked = await pickVoiceClip();
      if (!picked) return;
      setClip({ bytes: picked.bytes, mimeType: picked.mimeType });
      setConsent(false);
      setMessage('');
    } catch {
      setMessage('Could not open this clip. Choose an available WAV or M4A clip under 10 MiB.');
    } finally {
      await refreshRecovery();
      finish();
    }
  }

  async function sendEnrollment() {
    if (!clip || !canEnroll || !begin('enroll')) return;
    setMessage('');
    setConsent(false);
    Keyboard.dismiss();
    let failure: 'rejected' | 'unknown' | undefined;
    try {
      const audio = { bytes: clip.bytes.slice(), mimeType: clip.mimeType };
      const profile = await onEnroll({ audio, displayName: name, participantConfirmed: true });
      setProfiles(current => [profile, ...current.filter(item => item.profileId !== profile.profileId)]);
      clearDraft();
      setMessage('Voice profile created.');
    } catch (error) {
      failure = error && typeof error === 'object' && 'code' in error && error.code === 'voice_sample_rejected'
        ? 'rejected' : 'unknown';
    } finally {
      const restored = await refreshRecovery();
      if (failure === 'rejected') {
        if (restored && !restored.pendingEnrollment) {
          setClip(undefined);
          setMessage('This sample was rejected. Choose a different 2–30 second clip and confirm consent again.');
        } else {
          setMessage('This sample was rejected. Refresh profiles to check for pending changes.');
        }
      } else if (failure === 'unknown') {
        setMessage(!restored || restored.pendingEnrollment ? 'Could not verify the upload.'
          : 'Could not complete the upload. Check the clip and profile name, then confirm consent and try again.');
      }
      finish();
    }
  }

  async function sendDeletion(profileId: string) {
    if (!canMutate || (confirmDelete?.profileId !== profileId && !pendingDeletes.has(profileId)) || !begin('delete')) return;
    setMessage('');
    let result: 'pending' | 'deleted' | undefined;
    try {
      result = await onDelete(profileId);
      if (result === 'deleted') {
        setProfiles(current => current.filter(item => item.profileId !== profileId));
        setRecovery(current => current && {
          ...current, pendingDeletes: current.pendingDeletes.filter(id => id !== profileId),
        });
      }
    } catch {
      // The controller's recovery state determines whether verification is available.
    } finally {
      const restored = await refreshRecovery();
      const canVerify = restored?.pendingDeletes.includes(profileId);
      if (result === 'deleted') setMessage('Voice profile deleted.');
      else if (result === 'pending') setMessage(canVerify ? 'Deletion pending. Select Verify deletion to check again.'
        : 'Deletion pending. Refresh profiles to check for pending changes.');
      else setMessage(canVerify ? 'Could not verify deletion. Select Verify deletion to try again.'
        : 'Could not verify deletion. Refresh profiles and try again.');
      setConfirmDelete(undefined);
      finish();
    }
  }

  const rows = new Map<string, VoiceProfileManagerSummary | undefined>(profiles.map(profile => [profile.profileId, profile] as const));
  for (const profileId of pendingDeletes) {
    if (!rows.has(profileId)) rows.set(profileId, undefined);
  }
  const status = busy ? busyMessages[busy] : message;

  return (
    <>
      <ActionButton title="Manage voice profiles" variant="outlined" onPress={() => {
        setVisible(true);
        void refresh();
      }} />
      {visible ? (
        <Modal onRequestClose={close}>
          <DetailShell title="Voice profiles" onBack={close} backLabel={confirmDelete ? 'Back' : 'Close'} backDisabled={!!busy}>
            <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
              <ScrollView key={confirmDelete ? 'confirm-delete' : 'manage'}
                contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
                {status ? <Text accessibilityLiveRegion="polite" selectable style={body}>{status}</Text> : null}
                {confirmDelete ? (
                  <>
                    <Text accessibilityRole="header" style={[typography.heading, { color: palette.text }]}>
                      Delete voice profile
                    </Text>
                    <Text selectable style={body}>{confirmDelete.displayName}</Text>
                    <Text style={muted}>Delete this profile from voice matching?</Text>
                    <ActionButton title="Delete profile" variant="outlined"
                      disabled={!!busy || !canMutate} onPress={() => void sendDeletion(confirmDelete.profileId)} />
                    <ActionButton title="Cancel" variant="text" disabled={!!busy} onPress={close} />
                  </>
                ) : (
                  <>
                    {recoveryUnavailable ? (
                      <>
                        <Text accessibilityLiveRegion="polite" style={muted}>Could not check for pending changes. Refresh profiles to try again.</Text>
                        <ActionButton title="Refresh profiles" variant="outlined" disabled={!!busy} onPress={() => void refresh()} />
                      </>
                    ) : pendingEnrollment ? (
                      <Text accessibilityLiveRegion="polite" style={muted}>Upload pending. Use the same clip and profile name, then confirm consent to retry.</Text>
                    ) : null}
                    <Text style={muted}>Choose a separate 2–30 second WAV or M4A clip of one participant who agreed to share it. Maximum 10 MiB.</Text>
                    <ActionButton title={pendingEnrollment ? 'Choose same clip' : clip ? 'Choose another clip' : 'Choose audio clip'}
                      variant="outlined" disabled={!!busy || !canMutate} onPress={() => void chooseClip()} />
                    {clip ? <Text accessibilityLiveRegion="polite" style={body}>Audio clip selected.</Text> : null}
                    <View style={{ gap: spacing.xs }}>
                      <Text style={body}>Profile name</Text>
                      <TextInput accessibilityLabel="Profile name" value={displayName} onChangeText={setDisplayName}
                        editable={!busy && canMutate} maxLength={100} returnKeyType="done"
                        style={[body, { borderColor: palette.controlBorder, borderWidth: 1, padding: spacing.sm, minHeight: 48 }]} />
                    </View>
                    <View style={{ gap: spacing.xs }}>
                      <Text style={body}>{consent ? 'Participant consent confirmed.' : 'Confirm that the participant agreed to use this clip to create a voice profile.'}</Text>
                      <ActionButton title={consent ? 'Clear consent confirmation' : 'Confirm participant consent'}
                        variant="outlined" disabled={!!busy || !canMutate || !clip} onPress={() => setConsent(value => !value)} />
                    </View>
                    <ActionButton title={pendingEnrollment ? 'Retry upload' : 'Send clip and create profile'} variant="primary"
                      disabled={!!busy || !canEnroll} onPress={() => void sendEnrollment()} />
                    <View style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: spacing.md }}>
                      <Text accessibilityRole="header" style={[typography.heading, { color: palette.text }]}>Saved profiles</Text>
                      {listState === 'unavailable' ? (
                        <Text accessibilityLiveRegion="polite" style={muted}>Could not load saved profiles. Try refreshing.</Text>
                      ) : null}
                      {listState === 'loaded' && rows.size === 0 ? <Text style={muted}>No voice profiles yet.</Text> : null}
                      {[...rows].map(([profileId, profile]) => {
                        const pending = pendingDeletes.has(profileId);
                        return (
                          <View key={profileId} style={{ gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: palette.border, paddingBottom: spacing.sm }}>
                            {profile ? <Text selectable textBreakStrategy="simple" style={body}>{profile.displayName}</Text> : null}
                            <Text accessibilityLiveRegion="polite" style={muted}>{profile
                              ? pending ? 'Deletion pending' : profile.status === 'active' ? 'Ready' : 'Disabled'
                              : 'Profile deletion pending'}</Text>
                            {pending ? (
                              <ActionButton title="Verify deletion" variant="text" disabled={!!busy || !canMutate}
                                accessibilityLabel={profile ? `Verify deletion of ${profile.displayName}` : 'Verify deletion'}
                                onPress={() => { Keyboard.dismiss(); void sendDeletion(profileId); }} />
                            ) : profile ? (
                              <ActionButton title="Delete profile" variant="text" disabled={!!busy || !canMutate}
                                accessibilityLabel={`Delete ${profile.displayName}`}
                                onPress={() => { Keyboard.dismiss(); setConfirmDelete(profile); }} />
                            ) : null}
                          </View>
                        );
                      })}
                      {!recoveryUnavailable ? <ActionButton title="Refresh profiles" variant="text" disabled={!!busy} onPress={() => void refresh()} /> : null}
                    </View>
                  </>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          </DetailShell>
        </Modal>
      ) : null}
    </>
  );
}
