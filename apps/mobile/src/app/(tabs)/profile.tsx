import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { colors, radius, spacing } from "@/theme";
import { useAuth } from "@/providers/AuthProvider";
import { usePreferences } from "@/providers/PreferencesProvider";

export default function ProfileScreen() {
  const { identity, signOut } = useAuth();
  const { language } = usePreferences();
  const [busy, setBusy] = useState(false);

  return (
    <Screen>
      <PageHeader eyebrow="SYSTEM" title="Profile" badge="FREE PATH" />
      <View style={styles.card}>
        <Ionicons color={colors.violetSoft} name="person-circle-outline" size={48} />
        <View style={styles.copy}>
          <Text style={styles.title}>{identity?.name}</Text>
          <Text style={styles.body}>{identity?.email}</Text>
        </View>
      </View>
      <Pressable
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void signOut().finally(() => setBusy(false));
        }}
        style={styles.signOutButton}
      >
        {busy ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.signOutLabel}>{language === "sr" ? "Odjavi se" : "Sign out"}</Text>}
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  signOutButton: {
    minHeight: 50,
    marginTop: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#6c2f42",
  },
  signOutLabel: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "700",
  },
});
