import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { colors, radius, spacing } from "@/theme";

export default function ProfileScreen() {
  return (
    <Screen>
      <PageHeader eyebrow="SYSTEM" title="Profile" badge="FREE PATH" />
      <View style={styles.card}>
        <Ionicons color={colors.violetSoft} name="person-circle-outline" size={48} />
        <View style={styles.copy}>
          <Text style={styles.title}>Account connection comes next</Text>
          <Text style={styles.body}>Authentication, language, plan and preferences will be connected here without changing the web account.</Text>
        </View>
      </View>
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
});
