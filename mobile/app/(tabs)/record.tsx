import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useRef, useEffect } from 'react';
import { useRecording } from '../../hooks/useRecording';
import { theme } from '../../constants/colors';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function MeteringBar({ metering }: { metering: number }) {
  // metering is in dB, typically -160 (silence) to 0 (max)
  // normalize to 0-1 range
  const level = Math.max(0, Math.min(1, (metering + 60) / 60));
  return (
    <View style={meteringStyles.container}>
      <View style={[meteringStyles.bar, { width: `${level * 100}%` }]} />
    </View>
  );
}

const meteringStyles = StyleSheet.create({
  container: {
    height: 4,
    backgroundColor: theme.surface,
    borderRadius: 2,
    overflow: 'hidden',
    marginHorizontal: 40,
  },
  bar: {
    height: '100%',
    backgroundColor: theme.accent,
    borderRadius: 2,
  },
});

export default function RecordScreen() {
  const router = useRouter();
  const { startRecording, stopRecording, isRecording, duration, metering } = useRecording();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  const handlePress = async () => {
    if (isRecording) {
      const result = await stopRecording();
      if (result) {
        router.push({
          pathname: '/review',
          params: { uri: result.uri, duration: result.duration.toString() },
        });
      }
    } else {
      await startRecording();
    }
  };

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
          {isRecording && <MeteringBar metering={metering} />}
          <Text style={styles.timer}>{formatTime(duration)}</Text>
          <Text style={styles.timerLabel}>
            {isRecording ? 'Recording...' : 'Tap to record'}
          </Text>
        </View>

        <View style={styles.buttonSection}>
          <Pressable onPress={handlePress}>
            <Animated.View
              style={[
                styles.bigRecordButton,
                isRecording && { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <View
                style={[
                  styles.bigRecordDot,
                  isRecording && styles.stopSquare,
                ]}
              />
            </Animated.View>
          </Pressable>
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
  timerLabel: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  buttonSection: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  bigRecordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigRecordDot: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.destructive,
  },
  stopSquare: {
    width: 28,
    height: 28,
    borderRadius: 4,
  },
});
