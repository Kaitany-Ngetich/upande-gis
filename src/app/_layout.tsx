import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <AppStack />
    </SessionProvider>
  );
}

function AppStack() {
  const scheme = useColorScheme();
  const theme = useTheme();
  const { ready, backend } = useSession();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  const signedIn = Boolean(backend);
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerTintColor: theme.brand,
          headerTitleStyle: { color: theme.text, fontWeight: '700' },
          contentStyle: { backgroundColor: theme.backgroundElement },
        }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" options={{ title: 'My inspections' }} />
          <Stack.Screen name="run/[run]" options={{ title: 'Inspection run' }} />
          <Stack.Screen name="visit/[visit]" options={{ title: 'Waypoint' }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
