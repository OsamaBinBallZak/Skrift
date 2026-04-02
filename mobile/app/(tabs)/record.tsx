import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useRef, useEffect, useState, useCallback } from 'react';
import { useRecording } from '../../hooks/useRecording';
import { theme } from '../../constants/colors';

const WAVEFORM_BARS = 48;

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function Waveform({ metering, isActive }: { metering: number; isActive: boolean }) {
  const [bars, setBars] = useState<number[]>(() => new Array(WAVEFORM_BARS).fill(0));
  const meteringRef = useRef(metering);
  meteringRef.current = metering;

  useEffect(() => {
    if (!isActive) {
      setBars(new Array(WAVEFORM_BARS).fill(0));
      return;
    }

    // Timer-driven: push a new bar every 100ms regardless of metering changes
    const interval = setInterval(() => {
      const m = meteringRef.current;
      const raw = Math.max(0, Math.min(1, (m + 50) / 50));
      // Add randomness so it always looks alive (sim mic is often silent)
      const jitter = 0.05 + Math.random() * 0.15;
      const level = Math.min(1, Math.max(raw, jitter));
      setBars((prev) => [...prev.slice(1), level]);
    }, 100);

    return () => clearInterval(interval);
  }, [isActive]);

  return (
    <View style={waveStyles.container}>
      {bars.map((level, i) => {
        const height = Math.max(3, level * 56);
        const opacity = 0.25 + (i / WAVEFORM_BARS) * 0.75;
        return (
          <View
            key={i}
            style={[
              waveStyles.bar,
              { height, opacity },
            ]}
          />
        );
      })}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 64,
    gap: 1.5,
    paddingHorizontal: 10,
  },
  bar: {
    flex: 1,
    backgroundColor: theme.accent,
    borderRadius: 1.5,
  },
});

export default function RecordScreen() {
  const router = useRouter();
  const { startRecording, stopRecording, isRecording, duration, metering } = useRecording();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hasAutoStarted = useRef(false);

  // Auto-start recording when screen mounts
  useEffect(() => {
    if (!hasAutoStarted.current) {
      hasAutoStarted.current = true;
      startRecording().catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleStop = useCallback(async () => {
    const result = await stopRecording();
    if (result) {
      hasAutoStarted.current = false;
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
          {[
            "What's on your mind?",
            'Why does it matter?',
            'What triggered this thought?',
            'Any people involved?',
            'Tags \u2014 say them out loud',
          ].map((prompt, i) => (
            <View key={i} style={styles.promptRow}>
              <View style={styles.promptDot} />
              <Text style={styles.promptText}>{prompt}</Text>
            </View>
          ))}
        </View>

        <View style={styles.timerSection}>
          <Waveform metering={metering} isActive={isRecording} />
          <Text style={styles.timer}>{formatTime(duration)}</Text>
          <View style={styles.recordingIndicator}>
            {isRecording && <View style={styles.redDot} />}
            <Text style={styles.timerLabel}>
              {isRecording ? 'Recording' : 'Starting...'}
            </Text>
          </View>
        </View>

        <View style={styles.buttonSection}>
          <Pressable onPress={handleStop} disabled={!isRecording}>
            <Animated.View
              style={[
                styles.stopButton,
                { transform: [{ scale: pulseAnim }] },
                !isRecording && { opacity: 0.4 },
              ]}
            >
              <View style={styles.stopSquare} />
            </Animated.View>
          </Pressable>
          <Text style={styles.stopLabel}>Tap to stop</Text>
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
  stopLabel: {
    fontSize: 13,
    color: theme.textMuted,
  },
});
