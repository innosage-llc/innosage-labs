export type ProProfile = { key: string; accountScope: string };
export type ProOperation = {
  id: string;
  identifySpeakers: boolean;
  voiceIdentification?: { candidateProfileIds?: readonly string[] };
  lane: "pro";
  workerURL: string;
  accountScope: string;
  sourceBytes: number;
};
type ConfirmedVoiceSegment = {
  source: "confirmed_segment"; recordingRef: string; segmentId: string; startMs: number; endMs: number;
};
export type VoiceProfileScope = { workerURL: string; accountScope: string };
export type VoiceProfileClip = {
  bytes: Uint8Array;
  mimeType: "audio/mp4" | "audio/wav";
};
export type VoiceProfileEnrollment = VoiceProfileScope & {
  mutationKey: string;
  participantConfirmed: boolean;
} & (
  | { source: { source: "direct" }; audio: Blob | VoiceProfileClip }
  | { source: ConfirmedVoiceSegment; audio?: never }
);
type VoiceClipper = (segment: ConfirmedVoiceSegment, signal?: AbortSignal) => Promise<Blob>;
export type VoiceProfileSummary = {
  profileId: string;
  displayName: string;
  revision: number;
  status: "active" | "disabled";
};

export type SpeakerResult = {
  requested: boolean;
  status: string;
  transcript?: string;
};
export type TranscriptionResult = {
  state: string;
  transcript?: string;
  speakerLabeling?: SpeakerResult;
};
type Session = {
  state: string;
  operation: string;
  scope: string;
  voiceOptions?: string;
  diarization?: { enabled: boolean };
  sessionId: string;
  routerBaseUrl: string;
  uploadCapability: string;
  controlCapability: string;
  uploadExpiresAt: number;
  controlExpiresAt: number;
  maxBytes: number;
};
type Store = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};
type Upload = (
  url: string,
  file: Blob,
  headers: Record<string, string>,
  signal?: AbortSignal,
) => Promise<void>;
type Http = (url: string, init?: RequestInit) => Promise<Response>;
export class ProServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}
export const PRO_SOURCE_LIMIT = 512 * 1024 * 1024;
const VOICE_CONTRACT = "recorder-voice-profile/v1";
const VOICE_CLIP_LIMIT = 10 * 1024 * 1024;
const VOICE_PROFILES_PATH = "/api/voice-profiles/v1";
const voiceIdentifier = /^[A-Za-z0-9_-]{1,128}$/;

function validVoiceName(name: string) {
  const normalized = name.trim();
  const length = [...normalized].length;
  if (length < 1 || length > 100)
    throw new ProServiceError("Enter a display name up to 100 characters.", "voice_options_invalid");
  return normalized;
}

function profileSummary(raw: any): VoiceProfileSummary {
  if (!raw || typeof raw !== "object" || Object.keys(raw).length !== 4 ||
      typeof raw.profileId !== "string" || !voiceIdentifier.test(raw.profileId) ||
      typeof raw.displayName !== "string" || [...raw.displayName].length < 1 ||
      [...raw.displayName].length > 100 || !Number.isSafeInteger(raw.revision) ||
      raw.revision < 0 || (raw.status !== "active" && raw.status !== "disabled"))
    throw new ProServiceError("The voice profile response is unavailable.", "voice_unavailable");
  return { profileId: raw.profileId, displayName: raw.displayName,
    revision: raw.revision, status: raw.status };
}

/** Native Expo fetch accepts ArrayBuffer bodies; React Native Blob cannot wrap bytes. */
function nativeVoiceMultipart(audio: VoiceProfileClip, metadata: string, mutationKey: string) {
  if (!(audio.bytes instanceof Uint8Array) || audio.bytes.byteLength === 0 ||
      audio.bytes.byteLength > VOICE_CLIP_LIMIT ||
      (audio.mimeType !== "audio/mp4" && audio.mimeType !== "audio/wav") ||
      !voiceIdentifier.test(mutationKey))
    throw new ProServiceError("Choose a supported, short audio clip.", "voice_options_invalid");

  const boundaryPrefix = "RecorderVoice-";
  const boundary = boundaryPrefix + mutationKey.slice(0, 70 - boundaryPrefix.length);
  const encoder = new TextEncoder();
  // Neither metadata (JSON escapes all line breaks) nor the chosen binary may
  // create a multipart delimiter. Reject a collision before any transport.
  const delimiter = encoder.encode("--" + boundary);
  let offset = -1;
  while ((offset = audio.bytes.indexOf(delimiter[0]!, offset + 1)) >= 0) {
    if (offset + delimiter.length <= audio.bytes.byteLength &&
        delimiter.every((byte, i) => audio.bytes[offset + i] === byte))
      throw new ProServiceError("Choose a different audio clip.", "voice_options_invalid");
  }
  const filename = audio.mimeType === "audio/mp4" ? "sample.m4a" : "sample.wav";
  const prefix = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n` +
    `Content-Type: application/json\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${filename}"\r\n` +
    `Content-Type: ${audio.mimeType}\r\n\r\n`
  );
  const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
  const size = prefix.byteLength + audio.bytes.byteLength + suffix.byteLength;
  if (size > VOICE_CLIP_LIMIT)
    throw new ProServiceError("Choose a shorter audio clip.", "voice_options_invalid");
  const body = new Uint8Array(size);
  body.set(prefix);
  body.set(audio.bytes, prefix.byteLength);
  body.set(suffix, prefix.byteLength + audio.bytes.byteLength);
  return { body: body.buffer, headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` } };
}

async function enrollmentBody(
  input: VoiceProfileEnrollment,
  metadata: Record<string, unknown>,
  clipVoiceSample?: VoiceClipper,
  signal?: AbortSignal,
) {
  if (input.participantConfirmed !== true)
    throw new ProServiceError("Confirm permission before sharing a voice sample.", "voice_options_invalid");
  const sample = input.source;
  if (sample.source !== "direct" && (
    sample.source !== "confirmed_segment" ||
    !voiceIdentifier.test(sample.recordingRef) || !voiceIdentifier.test(sample.segmentId) ||
    !Number.isSafeInteger(sample.startMs) || !Number.isSafeInteger(sample.endMs) ||
    sample.startMs < 0 || sample.endMs - sample.startMs < 2000 ||
    sample.endMs - sample.startMs > 30_000
  )) throw new ProServiceError("Choose a confirmed 2 to 30 second speaker segment.", "voice_options_invalid");
  const publicSample = sample.source === "direct"
    ? { source: "direct" }
    : { source: "confirmed_segment", recordingRef: sample.recordingRef,
        segmentId: sample.segmentId, startMs: sample.startMs, endMs: sample.endMs };
  if (sample.source === "confirmed_segment" && (input.audio !== undefined || !clipVoiceSample))
    throw new ProServiceError("A confirmed segment must be clipped from its original recording first.", "voice_options_invalid");
  const audio = sample.source === "direct" ? input.audio : await clipVoiceSample!(publicSample as ConfirmedVoiceSegment, signal);
  const wireMetadata = JSON.stringify({ ...metadata, sample: publicSample, consent: {
    scope: "voice_profile_enrollment", participantConfirmed: true,
  } });
  if (audio && "bytes" in audio && "mimeType" in audio)
    return nativeVoiceMultipart(audio, wireMetadata, input.mutationKey);
  if (!audio || !("size" in audio) || audio.size <= 0 || audio.size > VOICE_CLIP_LIMIT)
    throw new ProServiceError("Choose a supported, short audio clip.", "voice_options_invalid");
  if (!["audio/mp4", "audio/wav", "audio/x-wav"].includes(audio.type))
    throw new ProServiceError("Use an M4A or WAV clip.", "voice_options_invalid");
  const form = new FormData();
  form.append("metadata", wireMetadata);
  form.append("audio", audio, audio.type === "audio/mp4" ? "sample.m4a" : "sample.wav");
  return { body: form };
}


function voiceOptions(operation: ProOperation) {
  if (operation.voiceIdentification === undefined) return;
  if (!operation.identifySpeakers)
    throw new ProServiceError("Voice matching requires speaker labels.", "voice_options_invalid");
  const ids = operation.voiceIdentification.candidateProfileIds;
  if (ids === undefined) return { contract: VOICE_CONTRACT };
  if (!Array.isArray(ids) || ids.length > 64 || new Set(ids).size !== ids.length ||
      ids.some(id => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)))
    throw new ProServiceError("The selected voice profiles are invalid.", "voice_options_invalid");
  return { contract: VOICE_CONTRACT, candidateProfileIds: [...ids].sort() };
}

function hasVoiceAcknowledgement(value: unknown) {
  if (value === null || typeof value !== "object") return false;
  return Object.keys(value).length === 1 && "contract" in value && value.contract === VOICE_CONTRACT;
}


export class ProClient {
  private readonly profileKey: string;
  private readonly recoveries = new Map<string, { binding: string; promise: Promise<Session> }>();

  constructor(
    readonly workerURL: string,
    private readonly routerURL: string,
    private readonly http: Http,
    private readonly store: Store,
    private readonly uploadFile: Upload,
    // Must bind original Recorder-owned recordingRef and exact decoded frame
    // interval. No confirmed-segment upload without this trusted local seam.
    private readonly clipVoiceSample?: VoiceClipper,
  ) {
    for (const url of [workerURL, routerURL]) {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.origin !== url)
        throw new Error("Invalid Pro service configuration.");
    }
    this.profileKey =
      "recorder.pro." + new URL(workerURL).hostname.replace(/[^\w.-]/g, "_");
  }

  private async request(url: string, init: RequestInit = {}, voiceEnrollment = false) {
    const timeout = AbortSignal.timeout(30_000);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    const response = await this.http(url, {
      ...init,
      signal,
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) {
      if (voiceEnrollment && response.status === 422) {
        const detail = await response.json().catch(() => null);
        if (detail && Object.keys(detail).length === 1 && detail.error === "invalid_sample")
          throw new ProServiceError("Use a clear 2–30 second clip of just one speaker.", "voice_sample_rejected");
        throw new ProServiceError("Could not verify the voice upload. Retry the same clip.", "voice_unavailable");
      }
      if (response.status === 401 || response.status === 403)
        throw new ProServiceError(
          "Pro authorization is unavailable or expired. Check your API key.",
          "authorization",
        );
      if (response.status === 413)
        throw new Error("This recording exceeds the supported file size.");
      if (response.status === 422) {
        const value = await response.json().catch(() => ({}));
        if (value.error === "speaker_unavailable")
          throw new ProServiceError(
            "Speaker identification is unavailable. Turn it off and start a new transcription.",
            "speaker_unavailable",
          );
        throw new Error(
          "This recording or speaker identification is unavailable.",
        );
      }
      throw new Error(
        "Transcription could not continue. Retry to resume the same operation.",
      );
    }
    return response;
  }

  async profile(): Promise<ProProfile | undefined> {
    const saved = await this.store.getItemAsync(this.profileKey);
    return saved ? JSON.parse(saved) : undefined;
  }

  async identity(key: string, signal?: AbortSignal): Promise<string> {
    const response = await this.request(
      this.workerURL + "/api/transcriptions/identity",
      {
        headers: { Authorization: `Bearer ${key}` },
        signal,
      },
    );
    const value = await response.json();
    if (value.success !== true || !/^[a-f0-9]{64}$/.test(value.accountScope))
      throw new Error("Pro validation returned an invalid response.");
    return value.accountScope;
  }

  async configure(key: string) {
    const normalized = key.trim();
    if (!normalized || /\s/.test(normalized) || normalized.length > 8192)
      throw new Error("Enter a valid Pro API key.");
    if (/^sk-(proj|svcacct)-/.test(normalized))
      throw new Error("Choose OpenAI to use an OpenAI API key.");
    const accountScope = await this.identity(normalized);
    await this.store.setItemAsync(
      this.profileKey,
      JSON.stringify({ key: normalized, accountScope }),
    );
  }

  private async voiceProfileRequest(
    scope: VoiceProfileScope,
    path: string,
    init: RequestInit = {},
    key?: string,
    voiceEnrollment = false,
  ) {
    if (scope.workerURL !== this.workerURL)
      throw new ProServiceError("This operation belongs to another environment.", "authorization");
    if (key !== undefined && !voiceIdentifier.test(key))
      throw new ProServiceError("Invalid voice profile operation.", "voice_options_invalid");
    const profile = await this.profile();
    if (!profile || profile.accountScope !== scope.accountScope ||
        await this.identity(profile.key, init.signal ?? undefined) !== scope.accountScope)
      throw new ProServiceError("Restore the Pro key for the original account and environment.", "authorization");
    return this.request(this.workerURL + VOICE_PROFILES_PATH + path, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${profile.key}`,
        ...(key === undefined ? {} : { "Idempotency-Key": key }),
      },
    }, voiceEnrollment);
  }

  async listVoiceProfiles(scope: VoiceProfileScope, signal?: AbortSignal): Promise<VoiceProfileSummary[]> {
    const response = await this.voiceProfileRequest(scope, "", { signal });
    const data = await response.json();
    if (data?.contract !== VOICE_CONTRACT || !Array.isArray(data.profiles) || data.profiles.length > 64)
      throw new ProServiceError("The voice profile response is unavailable.", "voice_unavailable");
    return data.profiles.map(profileSummary);
  }

  async enrollVoiceProfile(
    input: VoiceProfileEnrollment,
    displayName: string,
    signal?: AbortSignal,
  ): Promise<VoiceProfileSummary> {
    if (input.workerURL !== this.workerURL)
      throw new ProServiceError("This operation belongs to another environment.", "authorization");
    const multipart = await enrollmentBody(input, { displayName: validVoiceName(displayName) }, this.clipVoiceSample, signal);
    const response = await this.voiceProfileRequest(input, "", {
      method: "POST", ...multipart, signal,
    }, input.mutationKey, true);
    if (response.status !== 200 && response.status !== 201) {
      void response.body?.cancel().catch(() => undefined);
      throw new ProServiceError("Could not verify the enrollment receipt.", "voice_unavailable");
    }
    const data: unknown = await response.json().catch(() => undefined);
    if (!data || typeof data !== "object" || Array.isArray(data) ||
        Object.keys(data).length !== 2 || !Object.hasOwn(data, "contract") ||
        !Object.hasOwn(data, "profile") || !("contract" in data) ||
        data.contract !== VOICE_CONTRACT || !("profile" in data))
      throw new ProServiceError("Could not verify the enrollment receipt.", "voice_unavailable");
    return profileSummary(data.profile);
  }

  async updateVoiceProfileSample(
    profileId: string,
    input: VoiceProfileEnrollment,
    expectedRevision: number,
    mode: "add" | "replace",
    signal?: AbortSignal,
  ): Promise<VoiceProfileSummary> {
    if (!voiceIdentifier.test(profileId) || !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 0 || (mode !== "add" && mode !== "replace"))
      throw new ProServiceError("Invalid voice profile update.", "voice_options_invalid");
    if (input.workerURL !== this.workerURL)
      throw new ProServiceError("This operation belongs to another environment.", "authorization");
    const multipart = await enrollmentBody(input, { expectedRevision, mode }, this.clipVoiceSample, signal);
    const response = await this.voiceProfileRequest(input, `/${profileId}/samples`, {
      method: "POST", ...multipart, signal,
    }, input.mutationKey);
    const data = await response.json();
    if (data?.contract !== VOICE_CONTRACT || data.profile?.profileId !== profileId)
      throw new ProServiceError("The voice profile response is unavailable.", "voice_unavailable");
    return profileSummary(data.profile);
  }

  async editVoiceProfile(
    scope: VoiceProfileScope,
    profileId: string,
    mutationKey: string,
    expectedRevision: number,
    edit: { displayName?: string; status?: "active" | "disabled" },
    signal?: AbortSignal,
  ): Promise<VoiceProfileSummary> {
    if (!voiceIdentifier.test(profileId) || !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 0 || (edit.status === undefined && edit.displayName === undefined) ||
        (edit.status !== undefined && edit.status !== "active" && edit.status !== "disabled"))
      throw new ProServiceError("Invalid voice profile update.", "voice_options_invalid");
    const response = await this.voiceProfileRequest(scope, `/${profileId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision,
        ...(edit.status === undefined ? {} : { status: edit.status }),
        ...(edit.displayName === undefined ? {} : { displayName: validVoiceName(edit.displayName) }),
      }),
      signal,
    }, mutationKey);
    const data = await response.json();
    if (data?.contract !== VOICE_CONTRACT || data.profile?.profileId !== profileId)
      throw new ProServiceError("The voice profile response is unavailable.", "voice_unavailable");
    return profileSummary(data.profile);
  }

  async deleteVoiceProfile(
    scope: VoiceProfileScope,
    profileId: string,
    mutationKey: string,
    signal?: AbortSignal,
  ): Promise<"pending" | "deleted"> {
    if (!voiceIdentifier.test(profileId))
      throw new ProServiceError("Invalid voice profile.", "voice_options_invalid");
    const response = await this.voiceProfileRequest(scope, `/${profileId}`, {
      method: "DELETE", signal,
    }, mutationKey);
    if (response.status === 204) return "deleted";
    if (response.status === 202) return "pending";
    throw new ProServiceError("Voice profile deletion could not be verified.", "voice_unavailable");
  }

  async remove() {
    await this.store.deleteItemAsync(this.profileKey);
  }

  private sessionKey(recording: string, operation: ProOperation) {
    return "pro.session." + recording + "." + operation.id;
  }

  private async reserve(
    operation: ProOperation,
    recording: string,
    signal?: AbortSignal,
  ): Promise<Session> {
    const voice = voiceOptions(operation);
    const profile = await this.profile();
    if (
      operation.workerURL !== this.workerURL ||
      !profile ||
      (await this.identity(profile.key, signal)) !== operation.accountScope
    )
      throw new Error(
        "Restore the Pro key for this recording’s original account and environment.",
      );
    const response = await this.request(
      this.workerURL + "/api/transcriptions/reserve",
      {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${profile.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey: operation.id,
          diarization: { enabled: operation.identifySpeakers },
          ...(voice ? { voiceIdentification: voice } : {}),
        }),
      },
    );
    const value = await response.json();
    if (voice ? !hasVoiceAcknowledgement(value.voiceIdentification) : value.voiceIdentification !== undefined)
      throw new ProServiceError("Voice matching is not available for this operation.", "voice_unavailable");
    if (
      !["created", "idempotent"].includes(value.decision) ||
      value.routerBaseUrl !== this.routerURL ||
      !/^tx_[A-Za-z0-9_-]+$/.test(value.sessionId) ||
      typeof value.uploadCapability !== "string" ||
      value.uploadCapability.length < 16 ||
      typeof value.controlCapability !== "string" ||
      value.controlCapability.length < 16 ||
      !Array.isArray(value.allowedContentTypes) ||
      !value.allowedContentTypes.includes("audio/mp4") ||
      !Number.isSafeInteger(value.uploadExpiresAt) ||
      !Number.isSafeInteger(value.controlExpiresAt) ||
      !Number.isSafeInteger(value.maxBytes) ||
      value.maxBytes <= 0 ||
      (operation.identifySpeakers
        ? value.diarization?.enabled !== true ||
          value.speakerResultContract !== "draft-speaker-attribution/v1"
        : value.diarization !== undefined)
    )
      throw new Error("The Pro reservation returned an invalid response.");
    const session: Session = {
      ...value,
      operation: operation.id,
      scope: operation.accountScope,
      voiceOptions: voice ? JSON.stringify(voice) : undefined,
    };
    await this.store.setItemAsync(
      this.sessionKey(recording, operation),
      JSON.stringify(session),
    );
    return session;
  }

  private async session(
    operation: ProOperation,
    recording: string,
    signal?: AbortSignal,
    forceRecovery = false,
  ): Promise<Session> {
    if (operation.workerURL !== this.workerURL)
      throw new Error("This operation belongs to another environment.");
    const voice = voiceOptions(operation);
    const saved = await this.store.getItemAsync(
      this.sessionKey(recording, operation),
    );
    if (saved) {
      const value: Session = JSON.parse(saved);
      if (
        value.operation !== operation.id ||
        value.scope !== operation.accountScope ||
        (value.diarization?.enabled === true) !== operation.identifySpeakers ||
        value.voiceOptions !== (voice ? JSON.stringify(voice) : undefined) ||
        value.routerBaseUrl !== this.routerURL
      )
        throw new Error("This session belongs to another operation.");
      if (!forceRecovery && value.controlExpiresAt * 1000 > Date.now() + 5000)
        return value;
    }
    const deadline = /^recorder-transcription-v2-([0-9]{10})-/.exec(
      operation.id,
    );
    if (
      !forceRecovery &&
      (!deadline || Number(deadline[1]) * 1000 <= Date.now())
    )
      throw new ProServiceError(
        "This operation has expired.",
        "operation_expired",
      );
    const recoveryKey = this.sessionKey(recording, operation);
    const binding = JSON.stringify([operation.workerURL, operation.accountScope, operation.identifySpeakers, voice]);
    const existing = this.recoveries.get(recoveryKey);
    if (existing) {
      if (existing.binding !== binding)
        throw new Error("This session belongs to another operation.");
      return existing.promise;
    }
    const promise = this.reserve(operation, recording, signal).finally(() => {
      this.recoveries.delete(recoveryKey);
    });
    this.recoveries.set(recoveryKey, { binding, promise });
    return promise;
  }

  private path(session: Session) {
    return `${session.routerBaseUrl}/v1/sessions/${session.sessionId}`;
  }

  private async status(session: Session, signal?: AbortSignal) {
    return (
      await this.request(this.path(session), {
        headers: { Authorization: `Bearer ${session.controlCapability}` },
        signal,
      })
    ).json();
  }

  private async observed(
    operation: ProOperation,
    recording: string,
    signal?: AbortSignal,
  ) {
    let session = await this.session(operation, recording, signal);
    try {
      return { session, status: await this.status(session, signal) };
    } catch (error) {
      // Only a Router capability rejection reaches this branch. Worker key
      // authorization happens before it, in session recovery.
      if (!(error instanceof ProServiceError) || error.code !== "authorization")
        throw error;
      session = await this.session(operation, recording, signal, true);
      return { session, status: await this.status(session, signal) };
    }
  }

  async read(
    operation: ProOperation,
    recording: string,
    signal?: AbortSignal,
  ): Promise<TranscriptionResult> {
    let observation;
    try {
      observation = await this.observed(operation, recording, signal);
    } catch (error) {
      if (
        error instanceof ProServiceError &&
        error.code === "operation_expired"
      )
        return { state: "EXPIRED" };
      throw error;
    }
    const { session, status } = observation;
    if (status.state !== "COMPLETED") return { state: status.state };
    const headers = { Authorization: `Bearer ${session.controlCapability}` };
    const transcript = await (
      await this.request(this.path(session) + "/transcript", {
        headers,
        signal,
      })
    ).text();
    if (!transcript.trim())
      throw new Error(
        "The transcript is empty. Retry to recover this operation.",
      );
    const speakers: SpeakerResult | undefined = status.speakerLabeling;
    if (speakers?.status === "completed") {
      const payload = await (
        await this.request(this.path(session) + "/speakers", {
          headers,
          signal,
        })
      ).json();
      speakers.transcript = payload.segments
        .map((segment: { start_ms: number; text: string }, index: number) => {
          const raw = payload.annotations[index].speaker;
          if (!/^SPEAKER_0[1-8]$/.test(raw) && raw !== "SPEAKER_UNKNOWN")
            throw new Error("Invalid speaker result.");
          const label =
            raw === "SPEAKER_UNKNOWN"
              ? "Unknown speaker"
              : `Speaker ${Number(raw.slice(-2))}`;
          const seconds = segment.start_ms / 1000;
          return `[${Math.floor(seconds / 60)
            .toString()
            .padStart(
              2,
              "0",
            )}:${(seconds % 60).toFixed(3).padStart(6, "0")}] ${label}: ${segment.text}`;
        })
        .join("\n");
    }
    return { state: "COMPLETED", transcript, speakerLabeling: speakers };
  }

  // Read only after the caller has saved the usable original. No upload or
  // implicit retry; callers parse the optional payload and keep their transcript
  // even on unavailable/malformed results.
  async readVoiceIdentification(
    operation: ProOperation,
    recording: string,
    signal?: AbortSignal,
  ): Promise<
    | { result: Extract<VoiceIdentification, { status: "pending" }>; retryAfterSeconds: 2 }
    | { result: Exclude<VoiceIdentification, { status: "pending" }> }
    | undefined
  > {
    if (operation.workerURL !== this.workerURL)
      throw new Error("This operation belongs to another environment.");
    if (!voiceOptions(operation)) return;
    const profile = await this.profile();
    if (!profile || profile.accountScope !== operation.accountScope ||
        (await this.identity(profile.key, signal)) !== operation.accountScope)
      throw new ProServiceError("Restore the Pro key for this recording’s original account and environment.", "authorization");
    const { session, status } = await this.observed(operation, recording, signal);
    if (status.state !== "COMPLETED") return;
    const response = await this.request(this.path(session) + "/voice-identification", {
      headers: { Authorization: `Bearer ${session.controlCapability}` },
      signal,
    });
    const parsed = parseVoiceIdentification(await response.json());
    if (response.status === 202 && parsed?.status === "pending" &&
        response.headers.get("Retry-After") === "2")
      return { result: parsed, retryAfterSeconds: 2 };
    if (response.status === 200 && parsed && parsed.status !== "pending")
      return { result: parsed };
    throw new ProServiceError("Voice matching response is unavailable.", "voice_unavailable");
  }

  async upload(
    operation: ProOperation,
    recording: string,
    file: Blob,
    hash: () => Promise<string>,
    signal?: AbortSignal,
    onTransfer?: () => void,
  ) {
    if (file.size !== operation.sourceBytes || file.size > PRO_SOURCE_LIMIT)
      throw new Error("This source exceeds 512 MiB or has changed.");
    let observation;
    try {
      observation = await this.observed(operation, recording, signal);
    } catch (error) {
      if (
        error instanceof ProServiceError &&
        error.code === "operation_expired"
      )
        return { state: "EXPIRED" };
      throw error;
    }
    let { session, status } = observation;
    if (status.state === "RESERVED") {
      if (file.size > session.maxBytes)
        throw new Error("This source exceeds the service limit.");
      const sha256 = await hash();
      if (session.uploadExpiresAt * 1000 <= Date.now() + 5000)
        session = await this.reserve(operation, recording, signal);
      onTransfer?.();
      await this.uploadFile(
        this.path(session) + "/upload",
        file,
        {
          Authorization: `Bearer ${session.uploadCapability}`,
          "Content-Type": "audio/mp4",
          "Content-Length": String(file.size),
          "X-Content-SHA256": sha256,
        },
        signal,
      );
    }
    return this.read(operation, recording, signal);
  }

  async cleanup(operation: ProOperation, recording: string) {
    const voice = voiceOptions(operation);
    const key = this.sessionKey(recording, operation);
    const saved = await this.store.getItemAsync(key);
    if (!saved) return;
    let session: Session = JSON.parse(saved);
    if (
      session.operation !== operation.id ||
      session.scope !== operation.accountScope ||
      (session.diarization?.enabled === true) !== operation.identifySpeakers ||
      session.voiceOptions !== (voice ? JSON.stringify(voice) : undefined) ||
      session.routerBaseUrl !== this.routerURL ||
      operation.workerURL !== this.workerURL
    )
      throw new Error("Invalid cleanup binding.");
    if (session.controlExpiresAt * 1000 <= Date.now() + 5000)
      session = await this.session(operation, recording, undefined, true);
    if (session.state !== "CLEANED") {
      try {
        await this.request(this.path(session) + "/cleanup", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.controlCapability}` },
        });
      } catch (error) {
        if (
          !(error instanceof ProServiceError) ||
          error.code !== "authorization"
        )
          throw error;
        session = await this.session(operation, recording, undefined, true);
        if (session.state !== "CLEANED")
          await this.request(this.path(session) + "/cleanup", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.controlCapability}` },
          });
      }
    }
    await this.store.deleteItemAsync(key);
  }
}

/** Additive VoiceProfile result. Identity does not replace the authoritative transcript. */
export const VOICE_PROFILE_CONTRACT = VOICE_CONTRACT;
const dispositions = ["matched", "needs_review", "unknown"] as const;
type Disposition = typeof dispositions[number];
const errors = ["recognizer_unavailable", "segmentation_unavailable", "invalid_result"] as const;
type IdentificationError = typeof errors[number];

export type VoiceSegment = {
  segmentId: string;
  startMs: number;
  endMs: number;
  text: string;
  speakerId: string | null;
} & (
  | { disposition: "matched"; matchedProfileId: string }
  | { disposition: "needs_review" | "unknown"; matchedProfileId?: never }
);

export type VoiceIdentification =
  | { contract: typeof VOICE_PROFILE_CONTRACT; status: "pending" }
  | { contract: typeof VOICE_PROFILE_CONTRACT; status: "completed"; segments: VoiceSegment[] }
  | { contract: typeof VOICE_PROFILE_CONTRACT; status: "failed"; error: IdentificationError; segments: VoiceSegment[] };

type ObjectValue = Record<string, unknown>;
const opaque = /^[A-Za-z0-9_-]{1,128}$/;
const speaker = /^SPEAKER_0[1-8]$/;
const MAX_MS = 4 * 60 * 60 * 1000;
const MAX_SEGMENTS = 100_000;
const MAX_TEXT_CHARS = 16 * 1024 * 1024;

function object(value: unknown): value is ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: ObjectValue, fields: string[]) {
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every((key) => Object.hasOwn(value, key));
}

function segment(value: unknown): VoiceSegment | undefined {
  if (!object(value)) return;
  const { segmentId, startMs, endMs, text, speakerId, disposition, matchedProfileId } = value;
  if (
    typeof segmentId !== "string" || !opaque.test(segmentId) ||
    typeof startMs !== "number" || !Number.isSafeInteger(startMs) ||
    typeof endMs !== "number" || !Number.isSafeInteger(endMs) ||
    startMs < 0 || endMs < startMs || endMs > MAX_MS ||
    typeof text !== "string" ||
    !(speakerId === null || (typeof speakerId === "string" && speaker.test(speakerId))) ||
    !dispositions.includes(disposition as Disposition)
  ) return;
  const fields = ["segmentId", "startMs", "endMs", "text", "speakerId", "disposition"];
  const base = { segmentId, startMs, endMs, text, speakerId };
  if (disposition === "matched") {
    if (speakerId === null || startMs === endMs || typeof matchedProfileId !== "string" ||
        !opaque.test(matchedProfileId) || !exactFields(value, [...fields, "matchedProfileId"])) return;
    return { ...base, disposition, matchedProfileId };
  }
  if (!exactFields(value, fields)) return;
  return { ...base, disposition: disposition as "needs_review" | "unknown" };
}

/** Return undefined for an invalid optional sidecar. The caller keeps the original. */
export function parseVoiceIdentification(value: unknown): VoiceIdentification | undefined {
  if (!object(value) || value.contract !== VOICE_PROFILE_CONTRACT) return;
  const { status, error } = value;
  if (status === "pending") {
    if (exactFields(value, ["contract", "status"])) return { contract: VOICE_PROFILE_CONTRACT, status };
    return;
  }
  if (status !== "completed" && status !== "failed") return;
  if (!exactFields(value, ["contract", "status", "segments", ...(status === "failed" ? ["error"] : [])]) ||
      !Array.isArray(value.segments) || value.segments.length > MAX_SEGMENTS ||
      (status === "failed" && !errors.includes(error as IdentificationError))) return;
  const ids = new Set<string>();
  const names = new Map<string, string>();
  const review = new Set<string>();
  const result: VoiceSegment[] = [];
  let textUnits = 0;
  for (const row of value.segments) {
    const parsed = segment(row);
    if (!parsed || ids.has(parsed.segmentId) || (status === "failed" && parsed.disposition === "matched")) return;
    textUnits += parsed.text.length;
    if (textUnits > MAX_TEXT_CHARS) return;
    ids.add(parsed.segmentId);
    if (parsed.disposition === "matched" && parsed.speakerId !== null) {
      const prior = names.get(parsed.speakerId);
      if (review.has(parsed.speakerId) || (prior !== undefined && prior !== parsed.matchedProfileId)) return;
      names.set(parsed.speakerId, parsed.matchedProfileId);
    }
    if (parsed.disposition === "needs_review" && parsed.speakerId !== null) {
      if (names.has(parsed.speakerId)) return;
      review.add(parsed.speakerId);
    }
    result.push(parsed);
  }
  if (status === "failed") return { contract: VOICE_PROFILE_CONTRACT, status, error: error as IdentificationError, segments: result };
  return { contract: VOICE_PROFILE_CONTRACT, status, segments: result };
}
