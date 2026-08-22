import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { PageHeader } from "@/components/PageHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { colors, radius, spacing } from "@/theme";

export default function QuestsScreen() {
  const router = useRouter();

  return (
    <Screen>
      <PageHeader
        eyebrow="MISSION LOG"
        title="Quests"
        description="Plan concrete actions, then earn XP only when the work is done."
      />
      <View style={styles.emptyState}>
        <Ionicons color={colors.violetSoft} name="map-outline" size={34} />
        <Text style={styles.title}>No quests yet</Text>
        <Text style={styles.body}>Your active, planned and completed missions will live here.</Text>
        <PrimaryButton label="Create quest" onPress={() => router.push("/quest/new")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
  },
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
});
