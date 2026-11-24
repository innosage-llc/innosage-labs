import type { ProClient, VoiceProfileClip, VoiceProfileScope } from './ProClient';
import type { VoiceProfileIntents } from './VoiceProfileIntents';

type Client = Pick<ProClient, 'listVoiceProfiles' | 'enrollVoiceProfile' | 'deleteVoiceProfile'>;
type Journal = Pick<VoiceProfileIntents, 'restore' | 'beginEnrollment' | 'finalizeEnrollment' | 'beginDelete' | 'finalizeDelete'>;
type Digest = (bytes: Uint8Array) => string;

export function voiceProfileManagement(
  client: Client, scope: VoiceProfileScope, journal: Journal, digest: Digest,
) {
  return {
    async restore() {
      const state = await journal.restore();
      return { pendingEnrollment: !!state.enrollment,
        pendingDeletes: state.deletions.map(item => item.profileId) };
    },
    list: () => client.listVoiceProfiles(scope),
    async enroll(value: Readonly<{ audio: VoiceProfileClip; displayName: string; participantConfirmed: true }>) {
      if (value.participantConfirmed !== true) throw new Error('Confirm participant consent first.');
      const displayName = value.displayName.trim();
      if (![...displayName].length || [...displayName].length > 100)
        throw new Error('Enter a profile name up to 100 characters.');
      const audio = { bytes: value.audio.bytes, mimeType: value.audio.mimeType };
      if (!audio.bytes.byteLength || audio.bytes.byteLength > 10 * 1024 * 1024 - 4096)
        throw new Error('Choose a shorter audio clip.');
      const mutationKey = await journal.beginEnrollment({
        clipDigest: digest(audio.bytes), mime: audio.mimeType,
        nameDigest: digest(new TextEncoder().encode(displayName)),
      });
      try {
        const profile = await client.enrollVoiceProfile({
          ...scope, mutationKey, audio, participantConfirmed: true, source: { source: 'direct' },
        }, displayName);
        if (!await journal.finalizeEnrollment(mutationKey))
          throw new Error('Could not verify the exact enrollment receipt.');
        return profile;
      } catch (error) {
        // Only an exact rejection of this sample or a proven local no-send
        // validation can discard the intent. Transport/timeout stays pending.
        const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined;
        if (code === 'voice_sample_rejected' || code === 'voice_options_invalid')
          await journal.finalizeEnrollment(mutationKey);
        throw error;
      }
    },
    async delete(profileId: string) {
      const key = await journal.beginDelete(profileId);
      const result = await client.deleteVoiceProfile(scope, profileId, key);
      if (result === 'deleted' && !await journal.finalizeDelete(profileId, key))
        throw new Error('Could not verify the exact deletion receipt.');
      return result;
    },
  };
}
