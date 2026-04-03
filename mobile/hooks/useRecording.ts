import { useCallback, useState, useRef, useEffect } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

type RecordingResult = {
  uri: string;
  duration: number;
};

export function useRecording() {
  const [duration, setDuration] = useState(0);
  const [manualIsRecording, setManualIsRecording] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

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
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 200);
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
