import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useShareIntent } from 'expo-share-intent';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';

function RootStack() {
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const { shareIntent, resetShareIntent } = useShareIntent();

  // Handle shared audio files (from Voice Memos, WhatsApp, etc.)
  useEffect(() => {
    if (shareIntent?.files && shareIntent.files.length > 0) {
      const file = shareIntent.files[0];
      if (file.path) {
        router.push({
          pathname: '/review',
          params: { uri: file.path, duration: '0', shared: '1' },
        });
        resetShareIntent();
      }
    }
  }, [shareIntent]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootStack />
    </ThemeProvider>
  );
}
