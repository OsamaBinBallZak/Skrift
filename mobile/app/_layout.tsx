import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useShareIntent } from 'expo-share-intent';
import * as Linking from 'expo-linking';
import * as QuickActions from 'expo-quick-actions';
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

  // Register quick actions (long-press app icon)
  useEffect(() => {
    QuickActions.setItems([
      {
        id: 'record',
        title: 'Quick Record',
        icon: 'symbol:mic.fill',
        subtitle: 'Start recording a voice memo',
      },
    ]);

    // Handle quick action taps
    const sub = QuickActions.addListener((action) => {
      if (action.id === 'record') {
        router.replace('/(tabs)/record');
      }
    });

    // Handle quick action that launched the app (cold start)
    if (QuickActions.initial?.id === 'record') {
      router.replace('/(tabs)/record');
    }

    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle shared content (audio, URLs, images, text)
  useEffect(() => {
    if (!shareIntent) return;

    // Audio files → existing review screen (unchanged)
    if (shareIntent.files && shareIntent.files.length > 0) {
      const file = shareIntent.files[0];
      const mime = file.mimeType || '';
      if (mime.startsWith('audio/') && file.path) {
        router.push({
          pathname: '/review',
          params: { uri: file.path, duration: '0', shared: '1' },
        });
        resetShareIntent();
        return;
      }
      // Image files → capture screen
      if (mime.startsWith('image/') && file.path) {
        router.push({
          pathname: '/capture',
          params: { type: 'image', filePath: file.path, fileName: file.fileName || 'image' },
        });
        resetShareIntent();
        return;
      }
      // Other files → capture screen
      if (file.path) {
        router.push({
          pathname: '/capture',
          params: { type: 'file', filePath: file.path, fileName: file.fileName || 'file', mimeType: mime },
        });
        resetShareIntent();
        return;
      }
    }

    // URL shares
    if (shareIntent.webUrl) {
      router.push({
        pathname: '/capture',
        params: { type: 'url', url: shareIntent.webUrl, text: shareIntent.text || '' },
      });
      resetShareIntent();
      return;
    }

    // Text shares
    if (shareIntent.text) {
      router.push({
        pathname: '/capture',
        params: { type: 'text', text: shareIntent.text },
      });
      resetShareIntent();
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
