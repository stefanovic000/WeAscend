import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors } from "@/theme";
import { AuthLoading } from "@/components/AuthLoading";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { CloudStateProvider } from "@/providers/CloudStateProvider";
import { PreferencesProvider, usePreferences } from "@/providers/PreferencesProvider";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <PreferencesProvider>
        <AuthProvider>
          <CloudStateProvider>
            <RootNavigator />
          </CloudStateProvider>
        </AuthProvider>
      </PreferencesProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { identity, loading } = useAuth();
  const { language } = usePreferences();

  if (loading) return <AuthLoading />;

  const verified = Boolean(identity?.emailVerified);
  const unverified = Boolean(identity && !identity.emailVerified);

  return (
    <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      >
        <Stack.Protected guard={!identity}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={unverified}>
          <Stack.Screen name="verify-email" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={verified}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="quest/new" options={{ presentation: "modal", title: language === "sr" ? "Novi quest" : "New quest" }} />
        </Stack.Protected>
      </Stack>
  );
}
