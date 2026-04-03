import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { usePlayback } from '../hooks/usePlayback';
import { saveMemo } from '../lib/storage';
import { captureMetadata } from '../lib/metadata';
import type { MemoMetadata } from '../lib/metadata';
import { useTheme } from '../contexts/ThemeContext';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function MetadataRow({ label, value, theme }: { label: string; value: string | null; theme: ReturnType<typeof useTheme>['theme'] }) {
  if (!value) return null;
  return (
    <View style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    }}>
      <Text style={{ fontSize: 14, color: theme.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 14, color: theme.textPrimary, fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: 12 }}>{value}</Text>
    </View>
  );
}

export default function ReviewScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { uri, duration: durationParam } = useLocalSearchParams<{
    uri: string;
    duration: string;
  }>();
  const recordedDuration = parseInt(durationParam || '0', 10);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [metadata, setMetadata] = useState<MemoMetadata | null>(null);
  const [capturingMeta, setCapturingMeta] = useState(true);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const playback = usePlayback(uri);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    flex: {
      flex: 1,
      paddingHorizontal: 20,
    },
    scrollContent: {
      flex: 1,
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
      marginTop: 20,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    metaCard: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    metaLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
    },
    metaLoadingText: {
      fontSize: 13,
      color: theme.textMuted,
    },
    metaEmpty: {
      fontSize: 13,
      color: theme.textMuted,
      fontStyle: 'italic',
    },
    photoButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    photoButton: {
      flex: 1,
      backgroundColor: theme.surface,
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      gap: 4,
    },
    photoButtonIcon: {
      fontSize: 24,
    },
    photoButtonText: {
      fontSize: 13,
      color: theme.textSecondary,
    },
    photoPreview: {
      width: '100%',
      height: 180,
      borderRadius: 10,
      backgroundColor: theme.surface,
    },
    photoHint: {
      fontSize: 12,
      color: theme.textMuted,
      textAlign: 'center',
      marginTop: 6,
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
  }), [theme]);

  useEffect(() => {
    captureMetadata()
      .then(setMetadata)
      .catch(() => setMetadata(null))
      .finally(() => setCapturingMeta(false));
  }, []);

  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Camera access is required to take a photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!uri || saving) return;
    setSaving(true);

    const tags = tagInput
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    // Merge tags into metadata
    const finalMetadata = metadata
      ? { ...metadata, tags }
      : null;

    try {
      await saveMemo(uri, recordedDuration, tags, finalMetadata, photoUri);
      router.replace('/(tabs)');
    } catch {
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
          router.navigate({ pathname: '/(tabs)/record', params: { discarded: '1' } });
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

        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
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

          {/* Captured metadata */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Context</Text>
            {capturingMeta ? (
              <View style={styles.metaLoading}>
                <ActivityIndicator color={theme.accent} size="small" />
                <Text style={styles.metaLoadingText}>Capturing location, daylight, steps...</Text>
              </View>
            ) : metadata ? (
              <View style={styles.metaCard}>
                <MetadataRow
                  label="Location"
                  value={metadata.location?.placeName ?? null}
                  theme={theme}
                />
                <MetadataRow label="Day period" value={metadata.dayPeriod} theme={theme} />
                {metadata.daylight && (
                  <MetadataRow
                    label="Daylight"
                    value={`${metadata.daylight.sunrise} – ${metadata.daylight.sunset} (${metadata.daylight.hoursOfLight}h)`}
                    theme={theme}
                  />
                )}
                {metadata.steps !== null && (
                  <MetadataRow
                    label="Steps today"
                    value={metadata.steps.toLocaleString()}
                    theme={theme}
                  />
                )}
                {metadata.weather && (
                  <MetadataRow
                    label="Weather"
                    value={`${metadata.weather.conditions}, ${metadata.weather.temperature}°${metadata.weather.temperatureUnit}`}
                    theme={theme}
                  />
                )}
                {metadata.pressure && (
                  <MetadataRow
                    label="Pressure"
                    value={`${metadata.pressure.hPa} hPa · ${metadata.pressure.trend}`}
                    theme={theme}
                  />
                )}
              </View>
            ) : (
              <Text style={styles.metaEmpty}>No metadata captured</Text>
            )}
          </View>

          {/* Photo */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photo</Text>
            {photoUri ? (
              <Pressable onPress={() => setPhotoUri(null)}>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                <Text style={styles.photoHint}>Tap to remove</Text>
              </Pressable>
            ) : (
              <View style={styles.photoButtons}>
                <Pressable style={styles.photoButton} onPress={handleTakePhoto}>
                  <Text style={styles.photoButtonIcon}>📷</Text>
                  <Text style={styles.photoButtonText}>Camera</Text>
                </Pressable>
                <Pressable style={styles.photoButton} onPress={handlePickPhoto}>
                  <Text style={styles.photoButtonIcon}>🖼</Text>
                  <Text style={styles.photoButtonText}>Library</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Tags */}
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

          <View style={{ height: 20 }} />
        </ScrollView>

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
