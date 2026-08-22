import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { PageHeader } from "@/components/PageHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { colors, radius, spacing } from "@/theme";

export default function TodayScreen() {
  const router = useRouter();

  return (
    <Screen>
      <PageHeader eyebrow="WEASCEND · COMMAND" title="What is your next mission?" badge="FREE PATH" />

      <View style={styles.progressCard}>
        <View style={styles.progressIcon}>
          <Ionicons color={colors.violetSoft} name="sparkles" size={24} />
        </View>
        <View style={styles.progressCopy}>
          <Text style={styles.cardLabel}>YOUR ASCENSION STARTS HERE</Text>
          <Text style={styles.cardTitle}>No progress recorded yet</Text>
          <Text style={styles.cardBody}>Create one focused quest. Complete it. Let earned XP tell the story.</Text>
        </View>
      </View>

      <PrimaryButton label="Create your first quest" onPress={() => router.push("/quest/new")} />

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Today</Text>
        <Text style={styles.sectionMeta}>0 active</Text>
      </View>
      <View style={styles.emptyCard}>
        <Ionicons color={colors.textMuted} name="moon-outline" size={26} />
        <Text style={styles.emptyTitle}>The path is clear</Text>
        <Text style={styles.emptyBody}>Your quests scheduled for today will appear here.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressCard: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  progressIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "#201b42",
  },
  progressCopy: {
    flex: 1,
    gap: 5,
  },
  cardLabel: {
    color: colors.violetSoft,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  cardBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionHeading: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  sectionMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  emptyBody: {
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
});
