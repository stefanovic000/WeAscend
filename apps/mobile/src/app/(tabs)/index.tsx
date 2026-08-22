import { Ionicons } from "@expo/vector-icons";
import { activeXp, localDateKey, progressFromXp, rankForLevel } from "@weascend/shared";
import { type Href, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CloudStateMessage } from "@/components/CloudStateMessage";
import { PageHeader } from "@/components/PageHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { useCloudState } from "@/providers/CloudStateProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, radius, spacing } from "@/theme";

export default function TodayScreen() {
  const router = useRouter();
  const { state, plan, offline } = useCloudState();
  const { language } = usePreferences();
  const sr = language === "sr";

  if (!state) {
    return (
      <Screen>
        <PageHeader eyebrow="WEASCEND · COMMAND" title={sr ? "Koja je tvoja sledeća misija?" : "What is your next mission?"} />
        <CloudStateMessage />
      </Screen>
    );
  }

  const xp = activeXp(state.transactions);
  const progress = progressFromXp(xp, state.settings);
  const rank = rankForLevel(progress.level, state.settings.ranks);
  const today = localDateKey(new Date());
  const todayQuests = state.quests
    .filter(quest => quest.status !== "archived" && localDateKey(quest.date) === today)
    .sort((left, right) => left.date.localeCompare(right.date));
  const activeToday = todayQuests.filter(quest => quest.status === "active").length;
  const planLabel = plan?.name === "premium" ? "PREMIUM" : sr ? "FREE PUT" : "FREE PATH";

  return (
    <Screen>
      <PageHeader eyebrow="WEASCEND · COMMAND" title={sr ? "Koja je tvoja sledeća misija?" : "What is your next mission?"} badge={planLabel} />

      <View style={styles.progressCard}>
        <View style={styles.progressIcon}>
          <Ionicons color={colors.violetSoft} name="sparkles" size={24} />
        </View>
        <View style={styles.progressCopy}>
          <Text style={styles.cardLabel}>{sr ? `RANK ${rank} · LEVEL ${progress.level}` : `RANK ${rank} · LEVEL ${progress.level}`}</Text>
          <Text style={styles.cardTitle}>{xp} XP</Text>
          <Text style={styles.cardBody}>{progress.current} / {progress.needed} XP {sr ? "do sledećeg levela" : "to the next level"}</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress.percent}%` }]} /></View>
        </View>
      </View>

      <PrimaryButton disabled={offline} label={sr ? "Napravi quest" : "Create quest"} onPress={() => router.push("/quest/new")} />

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{sr ? "Danas" : "Today"}</Text>
        <Text style={styles.sectionMeta}>{activeToday} {sr ? "aktivnih" : "active"}</Text>
      </View>
      {todayQuests.length ? todayQuests.map(quest => {
        const skill = state.skills.find(item => item.id === quest.skillId);
        return (
          <Pressable
            accessibilityHint={sr ? "Otvara detalje i radnje za quest" : "Opens quest details and actions"}
            accessibilityRole="button"
            key={quest.id}
            onPress={() => router.push(`/quest/${encodeURIComponent(quest.id)}` as Href)}
            style={({ pressed }) => [styles.questCard, quest.status === "failed" && styles.failedQuest, pressed && styles.questPressed]}
          >
            <View style={styles.questTopLine}>
              <Text style={styles.questType}>{quest.type.toUpperCase()}</Text>
              <Text style={[styles.questStatus, quest.status === "failed" && styles.failedText]}>{quest.status.toUpperCase()}</Text>
            </View>
            <Text style={styles.questTitle}>{quest.title}</Text>
            <View style={styles.questMetaRow}>
              <Text style={styles.questMeta}>{skill?.name ?? (sr ? "Obrisan skill" : "Deleted skill")}</Text>
              <Text style={styles.questXp}>+{quest.xp} XP</Text>
            </View>
            <View style={styles.questOpenRow}><Text style={styles.questOpen}>{sr ? "Otvori" : "Open"}</Text><Ionicons color={colors.violetSoft} name="chevron-forward" size={16} /></View>
          </Pressable>
        );
      }) : (
        <View style={styles.emptyCard}>
          <Ionicons color={colors.textMuted} name="moon-outline" size={26} />
          <Text style={styles.emptyTitle}>{sr ? "Put je čist" : "The path is clear"}</Text>
          <Text style={styles.emptyBody}>{sr ? "Questovi planirani za danas pojaviće se ovde." : "Your quests scheduled for today will appear here."}</Text>
        </View>
      )}
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
  progressTrack: { height: 5, marginTop: 4, overflow: "hidden", borderRadius: 3, backgroundColor: colors.border },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: colors.cyan },
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
  questCard: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  failedQuest: { borderColor: "#6c2f42", backgroundColor: "#17101c" },
  questTopLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  questType: { color: colors.violetSoft, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  questStatus: { color: colors.textMuted, fontSize: 10, fontWeight: "800" },
  failedText: { color: colors.danger },
  questTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "700" },
  questMetaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  questMeta: { flex: 1, color: colors.textMuted, fontSize: 12 },
  questXp: { color: colors.cyan, fontSize: 13, fontWeight: "800" },
  questOpenRow: { paddingTop: spacing.xs, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3, borderTopWidth: 1, borderTopColor: colors.border },
  questOpen: { color: colors.violetSoft, fontSize: 12, fontWeight: "700" },
  questPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
