import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { colors, radius, spacing } from "@/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useCloudState } from "@/providers/CloudStateProvider";
import { usePreferences } from "@/providers/PreferencesProvider";

export default function ProfileScreen() {
  const { identity, signOut } = useAuth();
  const { language } = usePreferences();
  const { lastSyncedAt, offline, plan, refreshing, refresh } = useCloudState();
  const [busy, setBusy] = useState(false);
  const sr = language === "sr";
  const planLabel = plan?.name === "premium" ? "PREMIUM" : sr ? "FREE PUT" : "FREE PATH";
  const syncLabel = offline
    ? sr ? "Offline · samo pregled" : "Offline · view only"
    : refreshing
      ? sr ? "Osvežavam podatke…" : "Refreshing data…"
      : sr ? "Cloud podaci potvrđeni" : "Cloud data confirmed";

  return (
    <Screen>
      <PageHeader eyebrow="SYSTEM" title={sr ? "Profil" : "Profile"} badge={planLabel} />
      <View style={styles.card}>
        <Ionicons color={colors.violetSoft} name="person-circle-outline" size={48} />
        <View style={styles.copy}>
          <Text style={styles.title}>{identity?.name}</Text>
          <Text style={styles.body}>{identity?.email}</Text>
        </View>
      </View>
      <View style={styles.syncCard}>
        <Ionicons color={offline ? colors.gold : colors.cyan} name={offline ? "cloud-offline-outline" : "cloud-done-outline"} size={24} />
        <View style={styles.copy}>
          <Text style={styles.syncTitle}>{syncLabel}</Text>
          {lastSyncedAt ? <Text style={styles.syncTime}>{sr ? "Poslednja potvrda" : "Last confirmed"}: {new Date(lastSyncedAt).toLocaleString(language === "sr" ? "sr-RS" : "en-US")}</Text> : null}
        </View>
        <Pressable disabled={refreshing} onPress={refresh} style={styles.refreshButton}>
          <Ionicons color={colors.violetSoft} name="refresh" size={20} />
        </Pressable>
      </View>
      <Pressable
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void signOut().finally(() => setBusy(false));
        }}
        style={styles.signOutButton}
      >
        {busy ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.signOutLabel}>{sr ? "Odjavi se" : "Sign out"}</Text>}
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
  syncCard: {
    minHeight: 66,
    marginTop: spacing.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  syncTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  syncTime: { color: colors.textMuted, fontSize: 10, lineHeight: 15 },
  refreshButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: colors.surfaceRaised },
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
