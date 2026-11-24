/** Additive VoiceProfile result. Identity does not replace the authoritative transcript. */
export const VOICE_PROFILE_CONTRACT = "recorder-voice-profile/v1";
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
