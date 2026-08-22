import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CloudStateMessage } from "@/components/CloudStateMessage";
import { PageHeader } from "@/components/PageHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { useCloudState } from "@/providers/CloudStateProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, radius, spacing } from "@/theme";

export default function QuestsScreen() {
  const router = useRouter();
  const { state, offline } = useCloudState();
  const { language } = usePreferences();
  const sr = language === "sr";

  if (!state) {
    return (
      <Screen>
        <PageHeader eyebrow="MISSION LOG" title={sr ? "Questovi" : "Quests"} />
        <CloudStateMessage />
      </Screen>
    );
  }

  const visibleQuests = state.quests
    .filter(quest => quest.status !== "archived")
    .sort((left, right) => right.date.localeCompare(left.date));

  return (
    <Screen>
      <PageHeader
        eyebrow="MISSION LOG"
        title={sr ? "Questovi" : "Quests"}
        description={sr ? "Konkretne akcije povezane sa tvojim skillovima." : "Concrete actions connected to your skills."}
      />
      {visibleQuests.length ? (
        <View style={styles.list}>
          {visibleQuests.map(quest => {
            const attribute = state.attributes.find(item => item.id === quest.attributeId);
            const skill = state.skills.find(item => item.id === quest.skillId);
            return (
              <Pressable
                accessibilityHint={sr ? "Otvara detalje i radnje za quest" : "Opens quest details and actions"}
                accessibilityRole="button"
                key={quest.id}
                onPress={() => router.push(`/quest/${encodeURIComponent(quest.id)}` as Href)}
                style={({ pressed }) => [styles.questCard, quest.status === "failed" && styles.failedCard, pressed && styles.pressed]}
              >
                <View style={styles.topLine}>
                  <Text style={styles.type}>{quest.type.toUpperCase()}</Text>
                  <Text style={[styles.status, quest.status === "failed" && styles.failed]}>{quest.status.toUpperCase()}</Text>
                </View>
                <Text style={styles.title}>{quest.title}</Text>
                {quest.description ? <Text numberOfLines={2} style={styles.body}>{quest.description}</Text> : null}
                <View style={styles.bottomLine}>
                  <Text numberOfLines={1} style={styles.path}>{attribute?.name ?? "—"} › {skill?.name ?? "—"}</Text>
                  <Text style={styles.xp}>+{quest.xp} XP</Text>
                </View>
                <View style={styles.openRow}><Text style={styles.openText}>{sr ? "Otvori quest" : "Open quest"}</Text><Ionicons color={colors.violetSoft} name="chevron-forward" size={17} /></View>
              </Pressable>
            );
          })}
          <PrimaryButton disabled={offline} label={sr ? "Napravi quest" : "Create quest"} onPress={() => router.push("/quest/new")} />
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons color={colors.violetSoft} name="map-outline" size={34} />
          <Text style={styles.emptyTitle}>{sr ? "Još nema questova" : "No quests yet"}</Text>
          <Text style={styles.emptyBody}>{sr ? "Prva misija će se pojaviti ovde kada je napraviš." : "Your first mission will appear here when you create it."}</Text>
          <PrimaryButton disabled={offline} label={sr ? "Napravi quest" : "Create quest"} onPress={() => router.push("/quest/new")} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  questCard: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  failedCard: { borderColor: "#6c2f42", backgroundColor: "#17101c" },
  topLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  type: { color: colors.violetSoft, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  status: { color: colors.textMuted, fontSize: 10, fontWeight: "800" },
  failed: { color: colors.danger },
  title: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "700" },
  body: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  bottomLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  path: { flex: 1, color: colors.textMuted, fontSize: 12 },
  xp: { color: colors.cyan, fontSize: 13, fontWeight: "800" },
  openRow: { paddingTop: spacing.xs, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3, borderTopWidth: 1, borderTopColor: colors.border },
  openText: { color: colors.violetSoft, fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  emptyState: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: "700" },
  emptyBody: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
});
