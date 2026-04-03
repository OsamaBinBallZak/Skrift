import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { getMemo, deleteMemo, type Memo } from '../../lib/storage';
import { usePlayback } from '../../hooks/usePlayback';
import { theme } from '../../constants/colors';

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MemoDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [memo, setMemo] = useState<Memo | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (id) {
        getMemo(id).then(setMemo);
      }
    }, [id]),
  );

  const playback = usePlayback(memo?.audioUri);

  const handleDelete = () => {
    if (!memo) return;
    Alert.alert('Delete memo?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await playback.stop();
          await deleteMemo(memo.id);
          router.back();
        },
      },
    ]);
  };

  if (!memo) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backButton}>{'\u2190'} Back</Text>
        </Pressable>
        <Pressable onPress={handleDelete}>
          <Text style={styles.deleteButton}>Delete</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>
          Voice memo · {formatDuration(memo.duration)}
        </Text>
        <Text style={styles.date}>{formatDate(memo.recordedAt)}</Text>

        {/* Playback card */}
        <View style={styles.playerCard}>
          <Pressable
            onPress={() =>
              playback.isPlaying ? playback.pause() : playback.play()
            }
            style={styles.playButton}
          >
            <Text style={styles.playButtonText}>
              {playback.isPlaying ? '⏸' : '▶️'}
            </Text>
          </Pressable>
          <View style={styles.playerInfo}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: playback.duration
                      ? `${(playback.position / playback.duration) * 100}%`
                      : '0%',
                  },
                ]}
              />
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>
                {formatDuration(Math.floor(playback.position))}
              </Text>
              <Text style={styles.timeText}>
                {formatDuration(Math.floor(playback.duration))}
              </Text>
            </View>
          </View>
        </View>

        {/* Tags */}
        {memo.tags.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tags</Text>
            <View style={styles.tagsRow}>
              {memo.tags.map((tag, i) => (
                <View key={i} style={styles.tag}>
                  <Text style={styles.tagText}>#{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Capture context */}
        {memo.metadata && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Capture context</Text>
            <View style={styles.metaCard}>
              {memo.metadata.location?.placeName && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Location</Text>
                  <Text style={styles.metaValue}>{memo.metadata.location.placeName}</Text>
                </View>
              )}
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Day period</Text>
                <Text style={styles.metaValue}>{memo.metadata.dayPeriod}</Text>
              </View>
              {memo.metadata.daylight && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Daylight</Text>
                  <Text style={styles.metaValue}>
                    {memo.metadata.daylight.sunrise} – {memo.metadata.daylight.sunset} ({memo.metadata.daylight.hoursOfLight}h)
                  </Text>
                </View>
              )}
              {memo.metadata.steps !== null && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Steps today</Text>
                  <Text style={styles.metaValue}>{memo.metadata.steps.toLocaleString()}</Text>
                </View>
              )}
              {memo.metadata.weather && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Weather</Text>
                  <Text style={styles.metaValue}>
                    {memo.metadata.weather.conditions}, {memo.metadata.weather.temperature}°{memo.metadata.weather.temperatureUnit}
                  </Text>
                </View>
              )}
              {memo.metadata.pressure && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Pressure</Text>
                  <Text style={styles.metaValue}>
                    {memo.metadata.pressure.hPa} hPa · {memo.metadata.pressure.trend}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Sync status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sync</Text>
          <View style={styles.syncRow}>
            <View
              style={[
                styles.syncDot,
                memo.syncStatus === 'synced'
                  ? styles.syncDotSynced
                  : styles.syncDotWaiting,
              ]}
            />
            <Text style={styles.syncText}>
              {memo.syncStatus === 'synced'
                ? 'Synced to Mac'
                : 'Waiting \u2014 will sync when connected to Mac'}
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  loading: {
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    fontSize: 15,
    color: theme.accent,
    fontWeight: '500',
  },
  deleteButton: {
    fontSize: 15,
    color: theme.destructive,
    fontWeight: '500',
  },
  content: {
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.textPrimary,
    marginTop: 8,
  },
  date: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 6,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    gap: 14,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonText: {
    fontSize: 20,
  },
  playerInfo: {
    flex: 1,
  },
  progressBar: {
    height: 4,
    backgroundColor: theme.surfaceHover,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.accent,
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeText: {
    fontSize: 11,
    color: theme.textMuted,
    fontVariant: ['tabular-nums'],
  },
  section: {
    marginTop: 28,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: theme.accent + '18',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 14,
    color: theme.accent,
    fontWeight: '500',
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  syncDotWaiting: {
    backgroundColor: theme.stepEnhance,
  },
  syncDotSynced: {
    backgroundColor: theme.checkGreen,
  },
  syncText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  metaCard: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  metaLabel: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  metaValue: {
    fontSize: 14,
    color: theme.textPrimary,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
});
