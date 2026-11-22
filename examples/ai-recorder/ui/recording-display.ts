export type RecordingSummary = {
  uri: string;
  label: string;
  /** Local recording or import timestamp, in epoch milliseconds. */
  createdAt?: number;
  durationSeconds?: number;
};

export function recordingDate(timestamp?: number) {
  if (timestamp === undefined) return undefined;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export function formatRecordingTime(time: number) {
  const seconds = Math.floor(time);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function recordingDuration(seconds?: number) {
  return seconds !== undefined && Number.isFinite(seconds) && seconds > 0
    ? formatRecordingTime(seconds)
    : 'Duration unknown';
}
