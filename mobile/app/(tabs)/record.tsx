import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useRecording } from '../../hooks/useRecording';
import { useTheme } from '../../contexts/ThemeContext';
import { getPrompts, DEFAULT_PROMPTS } from '../../lib/prompts';

const WAVEFORM_BARS = 48;

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function Waveform({ metering, isActive, theme }: { metering: number; isActive: boolean; theme: ReturnType<typeof useTheme>['theme'] }) {
  const [bars, setBars] = useState<number[]>(() => new Array(WAVEFORM_BARS).fill(0));
  const meteringRef = useRef(metering);
  meteringRef.current = metering;

  useEffect(() => {
    if (!isActive) {
      setBars(new Array(WAVEFORM_BARS).fill(0));
      return;
    }

    const interval = setInterval(() => {
      const m = meteringRef.current;
      const raw = Math.max(0, Math.min(1, (m + 45) / 40));
      const baseline = 0.03 + Math.random() * 0.07;
      const level = Math.max(raw, baseline);
      setBars((prev) => [...prev.slice(1), level]);
    }, 100);

    return () => clearInterval(interval);
  }, [isActive]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 64, gap: 1.5, paddingHorizontal: 10 }}>
      {bars.map((level, i) => {
        const height = Math.max(2, level * 56);
        const opacity = 0.25 + (i / WAVEFORM_BARS) * 0.75;
        return (
          <View
            key={i}
            style={{ flex: 1, height, opacity, backgroundColor: theme.accent, borderRadius: 1.5 }}
          />
        );
      })}
    </View>
  );
}

export default function RecordScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ discarded?: string }>();
  const { startRecording, stopRecording, resetState, isRecording, duration, metering } = useRecording();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const skipAutoStart = useRef(false);
  const [prompts, setPromptsState] = useState<string[]>(DEFAULT_PROMPTS);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
    },
    promptsContainer: {
      marginTop: 24,
      padding: 16,
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    promptsTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 12,
    },
    promptRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
    },
    promptDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.accent,
      marginRight: 12,
    },
    promptText: {
      fontSize: 15,
      color: theme.textPrimary,
    },
    timerSection: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    timer: {
      fontSize: 64,
      fontWeight: '200',
      color: theme.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    recordingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    redDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.destructive,
    },
    timerLabel: {
      fontSize: 14,
      color: theme.textSecondary,
    },
    buttonSection: {
      alignItems: 'center',
      paddingBottom: 40,
      gap: 10,
    },
    stopButton: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: 'rgba(239, 68, 68, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: theme.destructive,
    },
    stopSquare: {
      width: 26,
      height: 26,
      borderRadius: 4,
      backgroundColor: theme.destructive,
    },
    recordButton: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: 'rgba(239, 68, 68, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: theme.destructive,
    },
    recordCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.destructive,
    },
    buttonLabel: {
      fontSize: 13,
      color: theme.textMuted,
    },
  }), [theme]);

  // When returning from discard, don't auto-start
  useEffect(() => {
    if (params.discarded === '1') {
      skipAutoStart.current = true;
      resetState();
    }
  }, [params.discarded, resetState]);

  // Auto-start recording when tab gains focus (unless returning from discard)
  useFocusEffect(
    useCallback(() => {
      // Load custom prompts
      getPrompts().then(setPromptsState);

      if (skipAutoStart.current) {
        skipAutoStart.current = false;
        return;
      }
      if (!isRecording) {
        resetState();
        setTimeout(() => {
          startRecording().catch(() => {});
        }, 100);
      }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  const handleRecord = useCallback(async () => {
    resetState();
    await startRecording().catch(() => {});
  }, [resetState, startRecording]);

  const handleStop = useCallback(async () => {
    const result = await stopRecording();
    if (result) {
      router.push({
        pathname: '/review',
        params: { uri: result.uri, duration: result.duration.toString() },
      });
    }
  }, [stopRecording, router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.promptsContainer}>
          <Text style={styles.promptsTitle}>Memory aids</Text>
          {prompts.map((prompt, i) => (
            <View key={i} style={styles.promptRow}>
              <View style={styles.promptDot} />
              <Text style={styles.promptText}>{prompt}</Text>
            </View>
          ))}
        </View>

        <View style={styles.timerSection}>
          <Waveform metering={metering} isActive={isRecording} theme={theme} />
          <Text style={styles.timer}>{formatTime(duration)}</Text>
          <View style={styles.recordingIndicator}>
            {isRecording && <View style={styles.redDot} />}
            <Text style={styles.timerLabel}>
              {isRecording ? 'Recording' : 'Tap to record'}
            </Text>
          </View>
        </View>

        <View style={styles.buttonSection}>
          {isRecording ? (
            <>
              <Pressable onPress={handleStop}>
                <Animated.View
                  style={[
                    styles.stopButton,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                >
                  <View style={styles.stopSquare} />
                </Animated.View>
              </Pressable>
              <Text style={styles.buttonLabel}>Tap to stop</Text>
            </>
          ) : (
            <>
              <Pressable onPress={handleRecord}>
                <View style={styles.recordButton}>
                  <View style={styles.recordCircle} />
                </View>
              </Pressable>
              <Text style={styles.buttonLabel}>Tap to record</Text>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
