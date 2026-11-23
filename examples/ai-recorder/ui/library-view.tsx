import { useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { LibraryAudioIcon } from './library-icons';
import type { CapturePhase } from './navigation';
import { knownRecordingDuration, recordingDate, recordingDayLabel, recordingRowText, type RecordingSummary } from './recording-display';
import { useTheme } from './theme';

type LibraryItem =
  | { kind: 'day'; key: string; date: Date | undefined }
  | { kind: 'recording'; key: string; recording: RecordingSummary };

export type LibraryViewHandle = {
  /** Scrolls toward the URI and returns true once its row is visible. */
  locateRecording: (uri: string) => boolean;
};

export type LibraryViewProps = {
  ref?: Ref<LibraryViewHandle>;
  recordings: readonly RecordingSummary[];
  phase: CapturePhase;
  /** Most recently saved capture during the Record-to-Library handoff. */
  highlightedUri?: string;
  onOpenRecording: (uri: string) => void;
};

function groupByDay(recordings: readonly RecordingSummary[]): LibraryItem[] {
  const sorted = recordings
    .map(recording => ({ recording, date: recordingDate(recording.createdAt) }))
    .sort((a, b) => (b.date?.getTime() ?? -Infinity) - (a.date?.getTime() ?? -Infinity));
  const items: LibraryItem[] = [];
  let previousDay: string | undefined;

  for (const { recording, date } of sorted) {
    const day = date?.toDateString() ?? 'unknown';
    if (day !== previousDay) {
      items.push({ kind: 'day', key: `day:${day}`, date });
      previousDay = day;
    }
    items.push({ kind: 'recording', key: `recording:${recording.uri}`, recording });
  }

  return items;
}

export function LibraryView({
  ref, recordings, phase, highlightedUri, onOpenRecording,
}: LibraryViewProps) {
  const { palette, spacing, typography } = useTheme();
  const data = useMemo(() => groupByDay(recordings), [recordings]);
  const today = new Date();
  const list = useRef<FlatList<LibraryItem>>(null);
  const listReady = useRef(false);
  const visibleUris = useRef(new Set<string>());
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item: LibraryItem }[] }) => {
    visibleUris.current = new Set(
      viewableItems.flatMap(({ item }) => item.kind === 'recording' ? [item.recording.uri] : [])
    );
  }).current;
  const disabled = phase !== 'idle';

  useImperativeHandle(ref, () => ({
    locateRecording(uri) {
      if (!listReady.current || !list.current) return false;
      const index = data.findIndex(item => item.kind === 'recording' && item.recording.uri === uri);
      if (index < 0) return false;
      if (visibleUris.current.has(uri)) return true;
      list.current.scrollToIndex({ index, animated: false, viewPosition: 0 });
      return false;
    },
  }), [data]);

  return (
    <FlatList
      ref={list}
      style={{ flex: 1 }}
      data={data}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
      keyExtractor={item => item.key}
      onLayout={() => { listReady.current = true; }}
      onViewableItemsChanged={onViewableItemsChanged}
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
      }}
      ListEmptyComponent={
        <View style={{ paddingTop: spacing.xxl, gap: spacing.sm }}>
          <Text accessibilityRole="header" style={[typography.heading, { color: palette.text }]}>
            Your recordings live here
          </Text>
          <Text style={[typography.body, { color: palette.muted }]}>
            Make a recording or import an M4A file. Playback and transcript choices stay on this device.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        if (item.kind === 'day') {
          return (
            <Text
              accessibilityRole="header"
              style={[typography.dayLabel, {
                color: palette.muted, paddingTop: spacing.lg, paddingBottom: spacing.sm,
              }]}
            >
              {recordingDayLabel(item.date, today)}
            </Text>
          );
        }

        const { label, uri, createdAt, durationSeconds } = item.recording;
        const { title, time } = recordingRowText(label, recordingDate(createdAt));
        const duration = knownRecordingDuration(durationSeconds);
        const metadata = [time, duration].filter(Boolean);
        const highlighted = uri === highlightedUri;
        const status = highlighted ? 'Just saved' : undefined;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={[title, ...metadata, status].filter(Boolean).join(', ')}
            accessibilityHint="Opens recording details"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onOpenRecording(uri)}
            android_ripple={{ color: palette.border }}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.md,
              minHeight: 48,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: spacing.md,
              backgroundColor: highlighted ? palette.surface : undefined,
              overflow: 'hidden',
            }}
          >
            <LibraryAudioIcon highlighted={highlighted} />
            <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
              <Text textBreakStrategy="simple" style={[typography.heading, { color: palette.text }]}>{title}</Text>
              {metadata.length > 0 ? (
                <Text style={[typography.caption, { color: palette.muted }]}>{metadata.join(' · ')}</Text>
              ) : null}
              {status ? (
                <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: palette.accent }]}>
                  {status}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}
