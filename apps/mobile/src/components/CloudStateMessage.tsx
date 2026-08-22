import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useCloudState } from "@/providers/CloudStateProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, radius, spacing } from "@/theme";

export function CloudStateMessage() {
  const { loading, refresh, refreshing } = useCloudState();
  const { language } = usePreferences();

  return (
    <View style={styles.card}>
      {loading || refreshing ? (
        <ActivityIndicator color={colors.violetSoft} size="large" />
      ) : (
        <Ionicons color={colors.danger} name="cloud-offline-outline" size={34} />
      )}
      <Text style={styles.title}>
        {loading || refreshing
          ? language === "sr" ? "Učitavam tvoj napredak" : "Loading your progress"
          : language === "sr" ? "Podaci trenutno nisu dostupni" : "Your data is currently unavailable"}
      </Text>
      <Text style={styles.body}>
        {loading || refreshing
          ? language === "sr" ? "Povezujemo tvoj nalog sa WeAscend sistemom." : "Connecting your account to the WeAscend system."
          : language === "sr" ? "Poveži se sa internetom i pokušaj ponovo." : "Connect to the internet and try again."}
      </Text>
      {!loading && !refreshing ? (
        <Pressable onPress={refresh} style={styles.button}>
          <Text style={styles.buttonLabel}>{language === "sr" ? "Pokušaj ponovo" : "Try again"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  button: {
    minHeight: 44,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.violet,
    borderRadius: radius.md,
  },
  buttonLabel: { color: colors.violetSoft, fontSize: 14, fontWeight: "700" },
});
