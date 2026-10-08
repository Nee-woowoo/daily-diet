import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { SplashOverlay } from '@/components/splash-overlay';
import { Colors } from '@/constants/theme';
import { AppStoreProvider } from '@/lib/storage';

SplashScreen.preventAutoHideAsync();

/** The app is light-only, so the navigation theme never follows the system scheme. */
const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.tint,
    background: Colors.background,
    card: Colors.card,
    text: Colors.text,
    border: Colors.border,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <AppStoreProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="recipe/[id]"
            options={{ title: '菜谱详情', headerBackTitle: '返回', headerTintColor: Colors.tint }}
          />
        </Stack>
      </AppStoreProvider>
      <SplashOverlay />
    </ThemeProvider>
  );
}
