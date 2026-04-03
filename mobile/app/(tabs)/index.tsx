import { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Alert,
  Animated as RNAnimated,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { loadMemos, deleteMemo, type Memo } from '../../lib/storage';
import { syncAllPending, getMacConnection } from '../../lib/sync';
import { useTheme } from '../../contexts/ThemeContext';
import { Swipeable } from 'react-native-gesture-handler';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

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

function SelectCircle({ selected, theme }: { selected: boolean; theme: ReturnType<typeof useTheme>['theme'] }) {
  return (
    <View style={[
      { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: theme.border, alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 14 },
      selected && { borderColor: theme.accent, backgroundColor: theme.accent },
    ]}>
      {selected && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' }} />}
    </View>
  );
}

function MemoCard({
  memo,
  onPress,
  onLongPress,
  selectMode,
  selected,
  styles,
  theme,
}: {
  memo: Memo;
  onPress: () => void;
  onLongPress: () => void;
  selectMode: boolean;
  selected: boolean;
  styles: ReturnType<typeof StyleSheet.create>;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <View style={styles.cardInner}>
        {selectMode && <SelectCircle selected={selected} theme={theme} />}
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              Voice memo · {formatDuration(memo.duration)}
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
        </View>
      </View>
    </Pressable>
  );
}

export default function MemosScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  // Selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const styles = useMemo(() => StyleSheet.create({
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
    // Select mode header
    selectHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 4,
    },
    selectCancel: {
      fontSize: 17,
      color: theme.accent,
      fontWeight: '400',
    },
    selectCount: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.textPrimary,
    },
    selectAll: {
      fontSize: 17,
      color: theme.accent,
      fontWeight: '400',
    },
    // List
    list: {
      paddingHorizontal: 20,
      paddingBottom: 100, // room for toolbar
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    cardSelected: {
      borderColor: theme.accent,
      backgroundColor: theme.accent + '08',
    },
    cardInner: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    cardContent: {
      flex: 1,
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
    // Bottom toolbar
    toolbar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 34, // safe area
      backgroundColor: theme.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    deleteButton: {
      backgroundColor: theme.destructive,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    deleteButtonText: {
      fontSize: 17,
      fontWeight: '600',
      color: '#ffffff',
    },
    // Swipe delete
    swipeDeleteAction: {
      backgroundColor: theme.destructive,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      width: 80,
      marginBottom: 10,
      marginLeft: -4,
    },
    swipeDeleteText: {
      color: '#ffffff',
      fontWeight: '600',
      fontSize: 14,
    },
  }), [theme]);

  const refresh = useCallback(async () => {
    const data = await loadMemos();
    setMemos(data);
  }, []);

  const autoSync = useCallback(async () => {
    if (syncingRef.current) return;
    const conn = await getMacConnection();
    if (!conn) return;

    const pending = (await loadMemos()).filter((m) => m.syncStatus === 'waiting');
    if (pending.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await syncAllPending();
      if (result.synced > 0) {
        await refresh();
      }
    } catch {
      // Silent failure
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      autoSync();
    }, [refresh, autoSync]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const enterSelectMode = (firstId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectMode(true);
    setSelectedIds(new Set([firstId]));
  };

  const exitSelectMode = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      // Exit select mode if nothing selected
      if (next.size === 0) {
        setTimeout(() => exitSelectMode(), 0);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(memos.map((m) => m.id)));
  };

  const handleDeleteSelected = () => {
    const count = selectedIds.size;
    Alert.alert(
      `Delete ${count} memo${count !== 1 ? 's' : ''}?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            for (const id of selectedIds) {
              await deleteMemo(id);
            }
            exitSelectMode();
            await refresh();
          },
        },
      ],
    );
  };

  const handleCardPress = (memo: Memo) => {
    if (selectMode) {
      toggleSelection(memo.id);
    } else {
      router.push(`/memo/${memo.id}`);
    }
  };

  const handleCardLongPress = (memo: Memo) => {
    if (!selectMode) {
      enterSelectMode(memo.id);
    }
  };

  const pendingCount = memos.filter((m) => m.syncStatus === 'waiting').length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {selectMode ? (
          <View style={styles.selectHeader}>
            <Pressable onPress={exitSelectMode} hitSlop={12}>
              <Text style={styles.selectCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.selectCount}>
              {selectedIds.size} selected
            </Text>
            <Pressable onPress={selectAll} hitSlop={12}>
              <Text style={styles.selectAll}>Select All</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.title}>Memos</Text>
            <Text style={styles.subtitle}>
              {memos.length} memo{memos.length !== 1 ? 's' : ''}
              {syncing
                ? ' · Syncing...'
                : pendingCount > 0
                  ? ` · ${pendingCount} waiting to sync`
                  : ''}
            </Text>
          </>
        )}
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
            !selectMode ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.accent}
              />
            ) : undefined
          }
          renderItem={({ item }) => {
            const renderRightActions = (_progress: RNAnimated.AnimatedInterpolation<number>, dragX: RNAnimated.AnimatedInterpolation<number>) => {
              const scale = dragX.interpolate({
                inputRange: [-80, 0],
                outputRange: [1, 0.5],
                extrapolate: 'clamp',
              });
              return (
                <Pressable
                  onPress={async () => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    await deleteMemo(item.id);
                    await refresh();
                  }}
                  style={styles.swipeDeleteAction}
                >
                  <RNAnimated.Text style={[styles.swipeDeleteText, { transform: [{ scale }] }]}>
                    Delete
                  </RNAnimated.Text>
                </Pressable>
              );
            };

            if (selectMode) {
              return (
                <MemoCard
                  memo={item}
                  onPress={() => handleCardPress(item)}
                  onLongPress={() => handleCardLongPress(item)}
                  selectMode={selectMode}
                  selected={selectedIds.has(item.id)}
                  styles={styles}
                  theme={theme}
                />
              );
            }

            return (
              <Swipeable
                renderRightActions={renderRightActions}
                overshootRight={false}
                friction={2}
              >
                <MemoCard
                  memo={item}
                  onPress={() => handleCardPress(item)}
                  onLongPress={() => handleCardLongPress(item)}
                  selectMode={selectMode}
                  selected={selectedIds.has(item.id)}
                  styles={styles}
                  theme={theme}
                />
              </Swipeable>
            );
          }}
        />
      )}

      {/* Bottom toolbar — slides up in select mode */}
      {selectMode && selectedIds.size > 0 && (
        <View style={styles.toolbar}>
          <Pressable
            style={styles.deleteButton}
            onPress={handleDeleteSelected}
          >
            <Text style={styles.deleteButtonText}>
              Delete ({selectedIds.size})
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
