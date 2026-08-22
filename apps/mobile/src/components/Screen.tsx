import type { PropsWithChildren } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useCloudState } from "@/providers/CloudStateProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, spacing } from "@/theme";

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  contentStyle?: ViewStyle;
}>;

export function Screen({ children, scroll = true, contentStyle }: ScreenProps) {
  const { offline, refresh, refreshing } = useCloudState();
  const { language } = usePreferences();
  const content = (
    <View style={[styles.content, contentStyle]}>
      {offline ? (
        <View accessibilityLiveRegion="polite" style={styles.offlineBanner}>
          <Ionicons color={colors.gold} name="cloud-offline-outline" size={18} />
          <View style={styles.offlineCopy}>
            <Text style={styles.offlineTitle}>{language === "sr" ? "Offline · samo pregled" : "Offline · view only"}</Text>
            <Text style={styles.offlineBody}>{language === "sr" ? "Prikazujemo poslednje potvrđene podatke." : "Showing your last confirmed data."}</Text>
          </View>
          <Pressable disabled={refreshing} onPress={refresh} style={styles.retryButton}>
            <Text style={styles.retryLabel}>{language === "sr" ? "Ponovi" : "Retry"}</Text>
          </Pressable>
        </View>
      ) : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 112,
  },
  offlineBanner: {
    minHeight: 58,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "#6c5531",
    borderRadius: 14,
    backgroundColor: "#181522",
  },
  offlineCopy: { flex: 1, gap: 2 },
  offlineTitle: { color: colors.gold, fontSize: 12, fontWeight: "800" },
  offlineBody: { color: colors.textMuted, fontSize: 11 },
  retryButton: { minHeight: 36, justifyContent: "center", paddingHorizontal: spacing.sm },
  retryLabel: { color: colors.text, fontSize: 12, fontWeight: "700" },
});
