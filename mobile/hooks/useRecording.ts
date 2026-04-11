import { useCallback, useState, useRef, useEffect } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { Platform } from 'react-native';

type RecordingResult = {
  uri: string;
  duration: number;
};

// ── Live Activity helpers (fire-and-forget, never block recording) ──

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

let _liveActivityModule: typeof import('expo-live-activity') | null = null;

async function getLiveActivity() {
  if (Platform.OS !== 'ios') return null;
  if (_liveActivityModule) return _liveActivityModule;
  try {
    _liveActivityModule = await import('expo-live-activity');
    return _liveActivityModule;
  } catch {
    return null;
  }
}

async function startLiveActivity(): Promise<string | null> {
  try {
    const LA = await getLiveActivity();
    if (!LA) return null;
    const id = LA.startActivity(
      { title: 'Recording', subtitle: '0:00' },
      {
        backgroundColor: '0f1117',
        titleColor: 'E4E4E7',
        subtitleColor: '7c6bf5',
        deepLinkUrl: 'skrift://record',
      },
    );
    return id ?? null;
  } catch {
    return null;
  }
}

async function updateLiveActivity(id: string, secs: number) {
  try {
    const LA = await getLiveActivity();
    LA?.updateActivity(id, { title: 'Recording', subtitle: formatDuration(secs) });
  } catch { /* ignore */ }
}

async function stopLiveActivity(id: string, secs: number) {
  try {
    const LA = await getLiveActivity();
    LA?.stopActivity(id, { title: 'Recording saved', subtitle: formatDuration(secs) });
  } catch { /* ignore */ }
}

// ── Hook ──

export function useRecording() {
  const [duration, setDuration] = useState(0);
  const [manualIsRecording, setManualIsRecording] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const liveActivityIdRef = useRef<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 150);

  const metering = recorderState.metering ?? -160;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        console.warn('[useRecording] Permission not granted');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();

      // Clear any lingering timer from a previous session
      if (timerRef.current) clearInterval(timerRef.current);

      setDuration(0);
      setManualIsRecording(true);
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(secs);
        // Fire-and-forget Live Activity update
        if (liveActivityIdRef.current) {
          updateLiveActivity(liveActivityIdRef.current, secs);
        }
      }, 1000);

      // Fire-and-forget: start Live Activity after recording is already running
      startLiveActivity().then(id => { liveActivityIdRef.current = id; });
    } catch (err) {
      console.warn('[useRecording] startRecording failed:', err);
      setManualIsRecording(false);
    }
  }, [recorder]);

  const stopRecording = useCallback(async (): Promise<RecordingResult | null> => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setManualIsRecording(false);

    // Fire-and-forget: stop Live Activity
    const laId = liveActivityIdRef.current;
    liveActivityIdRef.current = null;
    if (laId) {
      stopLiveActivity(laId, Math.floor((Date.now() - startTimeRef.current) / 1000));
    }

    try {
      await recorder.stop();
    } catch (err) {
      console.warn('[useRecording] stop failed:', err);
    }

    await setAudioModeAsync({ allowsRecording: false });

    const uri = recorder.uri;
    const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);

    if (!uri) return null;
    return { uri, duration: finalDuration };
  }, [recorder]);

  const resetState = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setDuration(0);
    setManualIsRecording(false);
  }, []);

  return {
    startRecording,
    stopRecording,
    resetState,
    isRecording: manualIsRecording,
    duration,
    metering,
  };
}
