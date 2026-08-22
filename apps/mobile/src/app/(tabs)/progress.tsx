import { Ionicons } from "@expo/vector-icons";
import { activeXp } from "@weascend/shared";
import { StyleSheet, Text, View } from "react-native";

import { CloudStateMessage } from "@/components/CloudStateMessage";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { useCloudState } from "@/providers/CloudStateProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, radius, spacing } from "@/theme";

export default function ProgressScreen() {
  const { state } = useCloudState();
  const { language } = usePreferences();
  const sr = language === "sr";

  if (!state) {
    return (
      <Screen>
        <PageHeader eyebrow={sr ? "TVOJ PUT" : "YOUR PATH"} title={sr ? "Napredak" : "Progress"} />
        <CloudStateMessage />
      </Screen>
    );
  }

  const attributes = state.attributes.filter(attribute => !attribute.deletedAt);

  return (
    <Screen>
      <PageHeader
        eyebrow={sr ? "TVOJ PUT" : "YOUR PATH"}
        title={sr ? "Oblasti napretka" : "Growth areas"}
        description={sr
          ? "Svaki skill pripada jednoj oblasti, a svaki quest pokazuje šta konkretno unapređuješ."
          : "Every skill belongs to one area, and every quest shows what you are improving."}
      />

      {attributes.length ? attributes.map(attribute => {
        const skills = state.skills.filter(skill => skill.attributeId === attribute.id && !skill.deletedAt);
        const attributeXp = activeXp(state.transactions.filter(transaction => transaction.attributeId === attribute.id));
        return (
          <View key={attribute.id} style={styles.areaCard}>
            <View style={styles.areaHeading}>
              <View style={[styles.areaMark, { backgroundColor: attribute.color || colors.violet }]} />
              <View style={styles.areaCopy}>
                <Text style={styles.areaName}>{attribute.name}</Text>
                <Text style={styles.areaMeta}>{skills.length} {sr ? "skillova" : "skills"}</Text>
              </View>
              <Text style={styles.areaXp}>{attributeXp} XP</Text>
            </View>

            <View style={styles.skillList}>
              {skills.length ? skills.map(skill => {
                const skillXp = activeXp(state.transactions.filter(transaction => transaction.skillId === skill.id));
                const completed = state.quests.filter(quest => quest.skillId === skill.id && quest.status === "completed").length;
                return (
                  <View key={skill.id} style={styles.skillRow}>
                    <View style={styles.skillIcon}><Ionicons color={colors.violetSoft} name="school-outline" size={18} /></View>
                    <View style={styles.skillCopy}>
                      <Text style={styles.skillName}>{skill.name}</Text>
                      <Text style={styles.skillMeta}>{completed} {sr ? "završenih questova" : "completed quests"}</Text>
                    </View>
                    <Text style={styles.skillXp}>{skillXp} XP</Text>
                  </View>
                );
              }) : <Text style={styles.emptySkill}>{sr ? "Još nema skillova u ovoj oblasti." : "No skills in this area yet."}</Text>}
            </View>
          </View>
        );
      }) : (
        <View style={styles.emptyState}>
          <Ionicons color={colors.violetSoft} name="planet-outline" size={34} />
          <Text style={styles.emptyTitle}>{sr ? "Nema oblasti napretka" : "No growth areas yet"}</Text>
          <Text style={styles.emptyBody}>{sr
            ? "Prva oblast može biti Languages, Strength, University ili bilo šta što želiš da unaprediš."
            : "Your first area can be Languages, Strength, University, or anything you want to improve."}</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  areaCard: { marginBottom: spacing.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  areaHeading: { minHeight: 72, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  areaMark: { width: 5, height: 38, borderRadius: 3 },
  areaCopy: { flex: 1, gap: 3 },
  areaName: { color: colors.text, fontSize: 19, fontWeight: "700" },
  areaMeta: { color: colors.textMuted, fontSize: 12 },
  areaXp: { color: colors.cyan, fontSize: 14, fontWeight: "800" },
  skillList: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  skillRow: { minHeight: 58, padding: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  skillIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "#201b42" },
  skillCopy: { flex: 1, gap: 3 },
  skillName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  skillMeta: { color: colors.textMuted, fontSize: 11 },
  skillXp: { color: colors.violetSoft, fontSize: 12, fontWeight: "800" },
  emptySkill: { padding: spacing.sm, color: colors.textMuted, fontSize: 13 },
  emptyState: { alignItems: "center", gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: "700", textAlign: "center" },
  emptyBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
});
