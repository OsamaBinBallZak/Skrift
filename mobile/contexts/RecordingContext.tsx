import { createContext, useContext, type ReactNode } from 'react';
import { useRecording, type CapturedPhoto } from '../hooks/useRecording';

type RecordingContextValue = {
  isRecording: boolean;
  duration: number;
  metering: number;
  capturedPhotos: CapturedPhoto[];
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ uri: string; duration: number; photos: CapturedPhoto[] } | null>;
  resetState: () => void;
  capturePhoto: (uri: string) => void;
};

const RecordingContext = createContext<RecordingContextValue>({
  isRecording: false,
  duration: 0,
  metering: -160,
  capturedPhotos: [],
  startRecording: async () => {},
  stopRecording: async () => null,
  resetState: () => {},
  capturePhoto: () => {},
});

export function RecordingProvider({ children }: { children: ReactNode }) {
  const recording = useRecording();

  const value: RecordingContextValue = {
    isRecording: recording.isRecording,
    duration: recording.duration,
    metering: recording.metering,
    capturedPhotos: recording.capturedPhotos,
    startRecording: recording.startRecording,
    stopRecording: recording.stopRecording,
    resetState: recording.resetState,
    capturePhoto: recording.capturePhoto,
  };

  return (
    <RecordingContext.Provider value={value}>
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecordingContext() {
  return useContext(RecordingContext);
}
