import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { File } from 'expo-file-system';
import { usePlayback } from '../hooks/usePlayback';
import { saveMemo } from '../lib/storage';
import { theme } from '../constants/colors';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ReviewScreen() {
  const router = useRouter();
  const { uri, duration: durationParam } = useLocalSearchParams<{
    uri: string;
    duration: string;
  }>();
  const recordedDuration = parseInt(durationParam || '0', 10);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const playback = usePlayback();

  useEffect(() => {
    if (uri) {
      playback.load(uri);
    }
  }, [uri]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!uri || saving) return;
    setSaving(true);

    const tags = tagInput
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    try {
      await saveMemo(uri, recordedDuration, tags);
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('Error', 'Failed to save memo');
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert('Discard recording?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          if (uri) {
            try {
              const f = new File(uri);
              if (f.exists) f.delete();
            } catch { /* already gone */ }
          }
          router.back();
        },
      },
    ]);
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={handleDiscard}>
            <Text style={styles.discardButton}>Discard</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Review</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardDuration}>{formatTime(recordedDuration)}</Text>
            <Pressable
              onPress={() => (playback.isPlaying ? playback.pause() : playback.play())}
              style={styles.playButton}
            >
              <Text style={styles.playButtonText}>
                {playback.isPlaying ? '⏸' : '▶️'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.cardDate}>{dateStr}</Text>
          {playback.isPlaying && (
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
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tags</Text>
          <TextInput
            style={styles.tagInput}
            placeholder="e.g. inzicht, filosofatie, realisatie"
            placeholderTextColor={theme.textMuted}
            value={tagInput}
            onChangeText={setTagInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.tagHint}>Separate with commas</Text>
        </View>

        <View style={styles.spacer} />

        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save memo'}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  flex: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  discardButton: {
    fontSize: 15,
    color: theme.destructive,
    fontWeight: '500',
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDuration: {
    fontSize: 28,
    fontWeight: '300',
    color: theme.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonText: {
    fontSize: 18,
  },
  cardDate: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 8,
  },
  progressBar: {
    height: 3,
    backgroundColor: theme.surfaceHover,
    borderRadius: 1.5,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.accent,
    borderRadius: 1.5,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  tagInput: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  tagHint: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 6,
  },
  spacer: {
    flex: 1,
  },
  saveButton: {
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
  },
});
