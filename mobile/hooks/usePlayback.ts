import { useState, useCallback, useRef, useEffect } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

export function usePlayback() {
  const [source, setSource] = useState<string | null>(null);
  const player = useAudioPlayer(source ?? undefined);
  const status = useAudioPlayerStatus(player);

  const load = useCallback((uri: string) => {
    setSource(uri);
  }, []);

  const play = useCallback(() => {
    player.play();
  }, [player]);

  const pause = useCallback(() => {
    player.pause();
  }, [player]);

  const stop = useCallback(async () => {
    player.pause();
    await player.seekTo(0);
  }, [player]);

  const seekTo = useCallback(
    async (seconds: number) => {
      await player.seekTo(seconds);
    },
    [player],
  );

  return {
    load,
    play,
    pause,
    stop,
    seekTo,
    isPlaying: status.playing,
    position: status.currentTime,
    duration: status.duration,
  };
}
