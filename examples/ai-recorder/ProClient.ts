export type ProProfile = { key: string; accountScope: string };
export type ProOperation = {
  id: string;
  identifySpeakers: boolean;
  lane: "pro";
  workerURL: string;
  accountScope: string;
  sourceBytes: number;
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

export class ProClient {
  private readonly profileKey: string;
  private readonly recoveries = new Map<string, Promise<Session>>();

  constructor(
    readonly workerURL: string,
    private readonly routerURL: string,
    private readonly http: Http,
    private readonly store: Store,
    private readonly uploadFile: Upload,
  ) {
    for (const url of [workerURL, routerURL]) {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.origin !== url)
        throw new Error("Invalid Pro service configuration.");
    }
    this.profileKey =
      "recorder.pro." + new URL(workerURL).hostname.replace(/[^\w.-]/g, "_");
  }

  private async request(url: string, init: RequestInit = {}) {
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
    const accountScope = await this.identity(normalized);
    await this.store.setItemAsync(
      this.profileKey,
      JSON.stringify({ key: normalized, accountScope }),
    );
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
        }),
      },
    );
    const value = await response.json();
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
    const saved = await this.store.getItemAsync(
      this.sessionKey(recording, operation),
    );
    if (saved) {
      const value: Session = JSON.parse(saved);
      if (
        value.operation !== operation.id ||
        value.scope !== operation.accountScope ||
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
    let recovery = this.recoveries.get(recoveryKey);
    if (!recovery) {
      recovery = this.reserve(operation, recording, signal).finally(() => {
        this.recoveries.delete(recoveryKey);
      });
      this.recoveries.set(recoveryKey, recovery);
    }
    return recovery;
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

  async upload(
    operation: ProOperation,
    recording: string,
    file: Blob,
    hash: () => Promise<string>,
    signal?: AbortSignal,
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
    const key = this.sessionKey(recording, operation);
    const saved = await this.store.getItemAsync(key);
    if (!saved) return;
    let session: Session = JSON.parse(saved);
    if (
      session.operation !== operation.id ||
      session.scope !== operation.accountScope ||
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
