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

function localCalendarDay(date: Date) {
  // Project the local date onto UTC so DST never changes the distance between days.
  const midnight = new Date(0);
  midnight.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return midnight.getTime() / 86_400_000;
}

export function recordingDayLabel(date: Date | undefined, today: Date) {
  if (!date) return 'Unknown date';

  const relativeDay = localCalendarDay(date) - localCalendarDay(today);
  if (relativeDay !== 0 && relativeDay !== -1) {
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  const relativeLabel = typeof Intl.RelativeTimeFormat === 'function'
    ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(relativeDay, 'day')
    : relativeDay === 0 ? 'Today' : 'Yesterday';
  const calendarLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${relativeLabel.charAt(0).toLocaleUpperCase()}${relativeLabel.slice(1)} · ${calendarLabel}`;
}

export function recordingRowText(label: string, date: Date | undefined): { title: string; time?: string } {
  if (!date) return { title: label };

  const minuteTime = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const secondTime = date.toLocaleTimeString();
  // Older capture labels include the date already displayed in the group heading.
  if (label === date.toLocaleString()) return { title: secondTime };
  if (label === minuteTime || label === secondTime) return { title: label };

  // The capture summary adds fractions and an offset when the whole second is shared.
  try {
    const preciseTime = date.toLocaleTimeString(undefined, {
      hour: 'numeric', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, timeZoneName: 'shortOffset',
    });
    if (label === preciseTime) return { title: label };
  } catch {
    // Some runtimes lack fractional-second or offset formatting.
  }
  return { title: label, time: minuteTime };
}

export function formatRecordingTime(time: number) {
  const seconds = Math.floor(time);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatDurationUnit(value: number, unit: 'minute' | 'second') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'unit', unit, unitDisplay: 'short' }).format(value);
  } catch {
    const suffix = unit === 'minute' ? 'min' : 'sec';
    return `${value.toLocaleString()} ${suffix}`;
  }
}

export function knownRecordingDuration(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return undefined;

  const totalSeconds = Math.max(1, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = formatDurationUnit(totalSeconds % 60, 'second');
  return minutes > 0 ? `${formatDurationUnit(minutes, 'minute')} ${remainder}` : remainder;
}

export function recordingDuration(seconds?: number) {
  return knownRecordingDuration(seconds) ?? 'Duration unknown';
}
