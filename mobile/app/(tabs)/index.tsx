import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { loadMemos, deleteMemo, type Memo } from '../../lib/storage';
import { theme } from '../../constants/colors';

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MemoCard({
  memo,
  onPress,
  onDelete,
}: {
  memo: Memo;
  onPress: () => void;
  onDelete: () => void;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onDelete} style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          Voice memo &middot; {formatDuration(memo.duration)}
        </Text>
        <View
          style={[
            styles.syncBadge,
            memo.syncStatus === 'synced'
              ? styles.syncBadgeSynced
              : styles.syncBadgeWaiting,
          ]}
        >
          <Text
            style={[
              styles.syncBadgeText,
              memo.syncStatus === 'synced'
                ? styles.syncBadgeTextSynced
                : styles.syncBadgeTextWaiting,
            ]}
          >
            {memo.syncStatus}
          </Text>
        </View>
      </View>
      <Text style={styles.cardDate}>{formatDate(memo.recordedAt)}</Text>
      {memo.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {memo.tags.map((tag, i) => (
            <View key={i} style={styles.tag}>
              <Text style={styles.tagText}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

export default function MemosScreen() {
  const router = useRouter();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const data = await loadMemos();
    setMemos(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleDelete = (memo: Memo) => {
    Alert.alert('Delete memo?', `${formatDuration(memo.duration)} recording`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMemo(memo.id);
          await refresh();
        },
      },
    ]);
  };

  const pendingCount = memos.filter((m) => m.syncStatus === 'waiting').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Memos</Text>
        <Text style={styles.subtitle}>
          {memos.length} memo{memos.length !== 1 ? 's' : ''}
          {pendingCount > 0 ? ` \u00b7 ${pendingCount} waiting to sync` : ''}
        </Text>
      </View>

      {memos.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🎙️</Text>
          <Text style={styles.emptyTitle}>No memos yet</Text>
          <Text style={styles.emptyText}>
            Tap the red button to record your first voice memo
          </Text>
        </View>
      ) : (
        <FlatList
          data={memos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.accent}
            />
          }
          renderItem={({ item }) => (
            <MemoCard
              memo={item}
              onPress={() => router.push(`/memo/${item.id}`)}
              onDelete={() => handleDelete(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 4,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  syncBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  syncBadgeWaiting: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  syncBadgeSynced: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
  },
  syncBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  syncBadgeTextWaiting: {
    color: theme.stepEnhance,
  },
  syncBadgeTextSynced: {
    color: theme.checkGreen,
  },
  cardDate: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 6,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 6,
  },
  tag: {
    backgroundColor: theme.accent + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 12,
    color: theme.accent,
    fontWeight: '500',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
