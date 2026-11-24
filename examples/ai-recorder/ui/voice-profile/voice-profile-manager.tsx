import { randomUUID } from 'expo-crypto';
import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { ActionButton } from '../ActionButton';
import { DetailShell } from '../DetailShell';
import { useTheme } from '../theme';
import { pickVoiceClip, VoiceClipError, type PickedVoiceClip, type VoiceProfileAudio } from './voice-profile-clip';

export type VoiceProfileManagerSummary = Readonly<{
  profileId: string;
  displayName: string;
  status: 'active' | 'disabled';
}>;

export type VoiceProfileManagerProps = {
  onList: (pendingEnrollmentKey?: string) => Promise<{
    profiles: readonly VoiceProfileManagerSummary[];
    /** Include only when the result of this exact mutation has been verified. */
    enrollment?: 'created' | 'not_created';
  }>;
  onEnroll: (request: Readonly<{
    audio: VoiceProfileAudio;
    displayName: string;
    participantConfirmed: true;
    mutationKey: string;
  }>) => Promise<VoiceProfileManagerSummary>;
  onDelete: (request: Readonly<{ profileId: string; mutationKey: string }>) => Promise<'pending' | 'deleted'>;
};

type EnrollmentAttempt = Pick<PickedVoiceClip, 'digest' | 'filename' | 'mimeType'> & {
  mutationKey: string;
  displayName: string;
  uncertain: boolean;
};

type DeletionAttempt = {
  profile: VoiceProfileManagerSummary;
  mutationKey: string;
  status: 'pending' | 'unverified';
};

const busyMessages = {
  list: 'Loading voice profiles…',
  pick: 'Opening audio clip…',
  enroll: 'Sending audio clip…',
  delete: 'Checking deletion…',
};
type Operation = keyof typeof busyMessages;

function matchesAttempt(clip: PickedVoiceClip, attempt: EnrollmentAttempt) {
  return clip.digest === attempt.digest && clip.filename === attempt.filename && clip.mimeType === attempt.mimeType;
}

function displaySummary({ profileId, displayName, status }: VoiceProfileManagerSummary): VoiceProfileManagerSummary {
  return { profileId, displayName, status };
}

export function VoiceProfileManager({ onList, onEnroll, onDelete }: VoiceProfileManagerProps) {
  const { palette, spacing, typography } = useTheme();
  const [visible, setVisible] = useState(false);
  const [profiles, setProfiles] = useState<readonly VoiceProfileManagerSummary[]>([]);
  const [hasListed, setHasListed] = useState(false);
  const [clip, setClip] = useState<PickedVoiceClip>();
  const [displayName, setDisplayName] = useState('');
  const [consent, setConsent] = useState(false);
  const [enrollment, setEnrollment] = useState<EnrollmentAttempt>();
  const [deletions, setDeletions] = useState<ReadonlyMap<string, DeletionAttempt>>(() => new Map());
  const [confirmDelete, setConfirmDelete] = useState<VoiceProfileManagerSummary>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<Operation>();
  const busyRef = useRef(false);

  const uncertain = enrollment?.uncertain === true;
  const name = displayName.trim();
  const canEnroll = !!clip && consent && name.length > 0 && [...name].length <= 100;
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

  async function refresh() {
    if (!begin('list')) return;
    setMessage('');
    try {
      const result = await onList(enrollment?.uncertain ? enrollment.mutationKey : undefined);
      setProfiles(result.profiles.map(displaySummary));
      setHasListed(true);
      if (enrollment?.uncertain && result.enrollment === 'created') {
        setEnrollment(undefined);
        clearDraft();
        setMessage('Voice profile created.');
      } else if (enrollment?.uncertain && result.enrollment === 'not_created') {
        setEnrollment({ ...enrollment, uncertain: false });
        setMessage('The upload did not create a profile.');
      }
    } catch {
      setMessage('Could not load voice profiles. Try refreshing.');
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
    setClip(undefined);
    setConsent(false);
    setDisplayName(enrollment?.uncertain ? enrollment.displayName : '');
    setMessage('');
    setVisible(false);
  }

  async function chooseClip() {
    if ((uncertain && clip) || !begin('pick')) return;
    Keyboard.dismiss();
    try {
      const picked = await pickVoiceClip();
      if (!picked) return;
      if (enrollment?.uncertain && !matchesAttempt(picked, enrollment)) {
        setMessage('Choose the same clip to retry, or refresh to check the upload.');
        return;
      }
      setClip(picked);
      setConsent(false);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof VoiceClipError ? error.message : 'Could not open the audio clip.');
    } finally {
      finish();
    }
  }

  async function sendEnrollment() {
    if (!clip || !canEnroll) return;
    const previous = enrollment && enrollment.displayName === name && matchesAttempt(clip, enrollment)
      ? enrollment : undefined;
    if ((uncertain && !previous) || !begin('enroll')) return;
    setMessage('');
    Keyboard.dismiss();
    let sent = false;
    try {
      // Pass a copy so the owner of the callback cannot modify the retry payload.
      const audio = { bytes: clip.bytes.slice(), mimeType: clip.mimeType };
      const mutationKey = previous?.mutationKey ?? randomUUID();
      setEnrollment({ mutationKey, digest: clip.digest, filename: clip.filename, mimeType: clip.mimeType,
        displayName: name, uncertain: true });
      sent = true;
      const profile = displaySummary(await onEnroll({ audio, displayName: name, participantConfirmed: true, mutationKey }));
      setProfiles(current => [profile, ...current.filter(item => item.profileId !== profile.profileId)]);
      setEnrollment(undefined);
      clearDraft();
      setMessage('Voice profile created.');
    } catch {
      if (!sent) setMessage('Could not prepare the upload.');
    } finally {
      finish();
    }
  }

  async function sendDeletion(profile: VoiceProfileManagerSummary) {
    if (confirmDelete?.profileId !== profile.profileId || !begin('delete')) return;
    const { profileId } = profile;
    const previous = deletions.get(profileId);
    setMessage('');
    let mutationKey: string | undefined;
    try {
      mutationKey = previous?.mutationKey ?? randomUUID();
      const attempt = { profile, mutationKey, status: previous?.status ?? 'unverified' } as const;
      setDeletions(current => new Map(current).set(profileId, attempt));
      const result = await onDelete({ profileId, mutationKey });
      setDeletions(current => {
        const next = new Map(current);
        if (result === 'deleted') next.delete(profileId);
        else next.set(profileId, { ...attempt, status: result });
        return next;
      });
      if (result === 'deleted') {
        setProfiles(current => current.filter(item => item.profileId !== profileId));
        setMessage('Voice profile deleted.');
      } else {
        setMessage('Deletion pending.');
      }
    } catch {
      setMessage(mutationKey ? 'Could not verify deletion.' : 'Could not prepare the deletion request.');
    } finally {
      setConfirmDelete(undefined);
      finish();
    }
  }

  const rows = new Map(profiles.map(profile => [profile.profileId, profile] as const));
  for (const { profile } of deletions.values()) {
    if (!rows.has(profile.profileId)) rows.set(profile.profileId, profile);
  }
  const retryDelete = confirmDelete && deletions.has(confirmDelete.profileId);
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
                      {retryDelete ? 'Verify deletion' : 'Delete voice profile'}
                    </Text>
                    <Text selectable style={body}>{confirmDelete.displayName}</Text>
                    <Text style={muted}>{retryDelete
                      ? 'Send the same deletion request again to verify the outcome.'
                      : 'Delete this profile from voice matching?'}</Text>
                    <ActionButton title={retryDelete ? 'Send deletion again' : 'Delete profile'} variant="outlined"
                      disabled={!!busy} onPress={() => void sendDeletion(confirmDelete)} />
                    <ActionButton title="Cancel" variant="text" disabled={!!busy} onPress={close} />
                  </>
                ) : (
                  <>
                    {uncertain && busy !== 'enroll' ? (
                      <>
                        <Text accessibilityLiveRegion="polite" style={muted}>Upload unverified. Refresh to check before choosing a different clip.</Text>
                        <ActionButton title="Refresh profiles" variant="outlined" disabled={!!busy} onPress={() => void refresh()} />
                      </>
                    ) : null}
                    <Text style={muted}>Choose a separate 2–30 second WAV or M4A clip of one participant who agreed to share it. Maximum 10 MiB.</Text>
                    <ActionButton title={uncertain ? 'Choose same clip' : clip ? 'Choose another clip' : 'Choose audio clip'}
                      variant="outlined" disabled={!!busy || (uncertain && !!clip)} onPress={() => void chooseClip()} />
                    {clip ? <Text selectable textBreakStrategy="simple" style={body}>{clip.filename}</Text> : null}
                    <View style={{ gap: spacing.xs }}>
                      <Text style={body}>Profile name</Text>
                      <TextInput accessibilityLabel="Profile name" value={displayName} onChangeText={setDisplayName}
                        editable={!busy && !uncertain} maxLength={100} returnKeyType="done"
                        style={[body, { borderColor: palette.controlBorder, borderWidth: 1, padding: spacing.sm, minHeight: 48 }]} />
                    </View>
                    <View style={{ gap: spacing.xs }}>
                      <Text style={body}>{consent ? 'Participant consent confirmed.' : 'Confirm that the participant agreed to use this clip to create a voice profile.'}</Text>
                      <ActionButton title={consent ? 'Clear consent confirmation' : 'Confirm participant consent'}
                        variant="outlined" disabled={!!busy || !clip} onPress={() => setConsent(value => !value)} />
                    </View>
                    <ActionButton title={uncertain ? 'Resend same clip' : 'Send clip and create profile'} variant="primary"
                      disabled={!!busy || !canEnroll} onPress={() => void sendEnrollment()} />
                    <View style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: spacing.md }}>
                      <Text accessibilityRole="header" style={[typography.heading, { color: palette.text }]}>Saved profiles</Text>
                      {hasListed && rows.size === 0 ? <Text style={muted}>No voice profiles yet.</Text> : null}
                      {[...rows.values()].map(profile => {
                        const deletion = deletions.get(profile.profileId);
                        const label = deletion?.status === 'pending' ? 'Deletion pending'
                          : deletion ? 'Deletion unverified' : profile.status === 'active' ? 'Ready' : 'Disabled';
                        return (
                          <View key={profile.profileId} style={{ gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: palette.border, paddingBottom: spacing.sm }}>
                            <Text selectable textBreakStrategy="simple" style={body}>{profile.displayName}</Text>
                            <Text accessibilityLiveRegion="polite" style={muted}>{label}</Text>
                            <ActionButton title={deletion ? 'Verify deletion' : 'Delete profile'} variant="text" disabled={!!busy}
                              accessibilityLabel={`${deletion ? 'Verify deletion of' : 'Delete'} ${profile.displayName}`}
                              onPress={() => { Keyboard.dismiss(); setConfirmDelete(profile); }} />
                          </View>
                        );
                      })}
                      {!uncertain ? <ActionButton title="Refresh profiles" variant="text" disabled={!!busy} onPress={() => void refresh()} /> : null}
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
