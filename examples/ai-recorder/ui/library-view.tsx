import { useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { LibraryAudioIcon, LibraryImportButton } from './library-icons';
import type { CapturePhase } from './navigation';
import { recordingDate, recordingDuration, type RecordingSummary } from './recording-display';
import { useTheme } from './theme';

type LibraryItem =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'recording'; key: string; recording: RecordingSummary };

export type LibraryViewHandle = {
  /** Scrolls toward the URI and returns true once its row is visible. */
  locateRecording: (uri: string) => boolean;
};

export type LibraryViewProps = {
  ref?: Ref<LibraryViewHandle>;
  recordings: readonly RecordingSummary[];
  phase: CapturePhase;
  highlightedUri?: string;
  importEnabled: boolean;
  onImport: () => void;
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
      const label = date?.toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
      }) ?? 'Unknown date';
      items.push({ kind: 'day', key: `day:${day}`, label });
      previousDay = day;
    }
    items.push({ kind: 'recording', key: `recording:${recording.uri}`, recording });
  }

  return items;
}

export function LibraryView({
  ref, recordings, phase, highlightedUri, importEnabled, onImport, onOpenRecording,
}: LibraryViewProps) {
  const { palette, spacing, typography } = useTheme();
  const data = useMemo(() => groupByDay(recordings), [recordings]);
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
    <View style={{ flex: 1 }}>
      <View style={{ alignItems: 'flex-end', paddingHorizontal: spacing.lg }}>
        <LibraryImportButton
          importing={phase === 'importing'}
          disabled={disabled || !importEnabled}
          onPress={onImport}
        />
      </View>
      <FlatList
        ref={list}
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
                style={[typography.heading, {
                  color: palette.text, paddingTop: spacing.lg, paddingBottom: spacing.sm,
                }]}
              >
                {item.label}
              </Text>
            );
          }

          const { label, uri, durationSeconds } = item.recording;
          const duration = recordingDuration(durationSeconds);
          const highlighted = uri === highlightedUri;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={highlighted ? `${label}, ${duration}, Newly saved recording` : `${label}, ${duration}`}
              accessibilityHint="Opens recording details"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => onOpenRecording(uri)}
              android_ripple={{ color: palette.border }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                minHeight: 48,
                marginBottom: spacing.sm,
                padding: spacing.lg,
                borderRadius: 28,
                borderWidth: 2,
                borderColor: highlighted ? palette.accent : palette.surface,
                backgroundColor: palette.surface,
                overflow: 'hidden',
              }}
            >
              <LibraryAudioIcon />
              <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
                <Text textBreakStrategy="simple" style={[typography.heading, { color: palette.text }]}>{label}</Text>
                <Text style={[typography.body, { color: palette.muted }]}>{duration}</Text>
                {highlighted ? (
                  <Text accessibilityLiveRegion="polite" style={[typography.body, { color: palette.accent }]}>
                    Newly saved recording
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
