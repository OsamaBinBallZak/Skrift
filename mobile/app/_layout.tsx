import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useShareIntent } from 'expo-share-intent';
import * as Linking from 'expo-linking';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';

function RootStack() {
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const { shareIntent, resetShareIntent } = useShareIntent();

  // Handle deep links from Lock Screen widget and other sources
  useEffect(() => {
    function handleDeepLink(event: { url: string }) {
      const { url } = event;
      // skrift://record -> navigate to Record tab
      if (url === 'skrift://record' || url.startsWith('skrift://record')) {
        router.replace('/(tabs)/record');
      }
    }

    // Handle URL that launched the app (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    // Handle URL while app is already open (warm start)
    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          animation: 'slide_from_right',
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <RootStack />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
