import { Ionicons } from "@expo/vector-icons";
import { type WeAscendState } from "@weascend/shared";
import { type Href, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useOnboarding } from "@/providers/OnboardingProvider";
import { colors, radius, spacing } from "@/theme";

type GettingStartedCardProps = {
  language: "en" | "sr";
  offline: boolean;
  state: WeAscendState;
};

export function gettingStartedProgress(state: WeAscendState) {
  const activeAreaIds = new Set(state.attributes.filter(attribute => !attribute.deletedAt).map(attribute => attribute.id));
  const hasArea = activeAreaIds.size > 0;
  const hasSkill = state.skills.some(skill => !skill.deletedAt && activeAreaIds.has(skill.attributeId));
  const hasQuest = state.quests.length > 0 || state.transactions.length > 0;
  const hasCompletedQuest = state.quests.some(quest => quest.status === "completed" || quest.archivedFromStatus === "completed") ||
    state.transactions.some(transaction => !transaction.reversedAt);
  const completed = [hasArea, hasSkill, hasQuest, hasCompletedQuest];
  return { completed, count: completed.filter(Boolean).length, complete: completed.every(Boolean) };
}

export function GettingStartedCard({ language, offline, state }: GettingStartedCardProps) {
  const router = useRouter();
  const { checklistRequested, dismissChecklist } = useOnboarding();
  const sr = language === "sr";
  const progress = gettingStartedProgress(state);
  if (progress.complete && !checklistRequested) return null;

  const firstActiveQuest = state.quests.find(quest => quest.status === "active");
  const steps = [
    {
      title: sr ? "Napravi oblast napretka" : "Create a growth area",
      body: sr ? "Primer: Languages, Strength ili University" : "For example: Languages, Strength, or University",
      icon: "planet-outline" as const,
      route: "/progress" as Href,
    },
    {
      title: sr ? "Dodaj skill u oblast" : "Add a skill inside it",
      body: sr ? "Primer: Spanish unutar Languages" : "For example: Spanish inside Languages",
      icon: "school-outline" as const,
      route: "/progress" as Href,
    },
    {
      title: sr ? "Napravi prvi quest" : "Create your first quest",
      body: sr ? "Jedna konkretna radnja koju možeš završiti" : "One concrete action you can complete",
      icon: "add-circle-outline" as const,
      route: "/quest/new" as Href,
    },
    {
      title: sr ? "Završi quest i osvoji XP" : "Complete it and earn XP",
      body: sr ? "XP se beleži tek kada je stvarni rad završen" : "XP is recorded only after the real work is done",
      icon: "checkmark-circle-outline" as const,
      route: firstActiveQuest ? (`/quest/${encodeURIComponent(firstActiveQuest.id)}` as Href) : ("/quests" as Href),
    },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}><Ionicons color={colors.cyan} name="compass-outline" size={21} /></View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{sr ? "PRVA MISIJA" : "FIRST MISSION"}</Text>
          <Text style={styles.title}>{progress.complete ? (sr ? "Osnova je spremna" : "Your foundation is ready") : (sr ? "Započni svoj uspon" : "Begin your ascent")}</Text>
        </View>
        <Text style={styles.count}>{progress.count}/4</Text>
        {progress.complete ? (
          <Pressable accessibilityLabel={sr ? "Zatvori checklistu" : "Close checklist"} hitSlop={8} onPress={dismissChecklist} style={styles.closeButton}>
            <Ionicons color={colors.textMuted} name="close" size={19} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.track}><View style={[styles.fill, { width: `${progress.count * 25}%` }]} /></View>

      <View style={styles.steps}>
        {steps.map((item, index) => {
          const done = progress.completed[index];
          const isNext = !done && progress.completed.slice(0, index).every(Boolean);
          return (
            <Pressable
              accessibilityHint={sr ? "Otvara ekran za ovaj korak" : "Opens the screen for this step"}
              accessibilityRole="button"
              disabled={offline}
              key={item.title}
              onPress={() => router.push(item.route)}
              style={({ pressed }) => [styles.step, isNext && styles.nextStep, done && styles.doneStep, pressed && styles.pressed]}
            >
              <View style={[styles.stepIcon, done && styles.doneIcon, isNext && styles.nextIcon]}>
                <Ionicons color={done ? colors.cyan : isNext ? colors.text : colors.textMuted} name={done ? "checkmark" : item.icon} size={18} />
              </View>
              <View style={styles.stepCopy}>
                <Text style={[styles.stepTitle, done && styles.doneText]}>{item.title}</Text>
                <Text style={styles.stepBody}>{item.body}</Text>
              </View>
              {!done ? <Ionicons color={isNext ? colors.violetSoft : colors.textMuted} name="chevron-forward" size={17} /> : null}
            </Pressable>
          );
        })}
      </View>
      {offline && !progress.complete ? <Text style={styles.offline}>{sr ? "Poveži se na internet da nastaviš." : "Reconnect to continue."}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md, overflow: "hidden", borderWidth: 1, borderColor: "#51458d", borderRadius: radius.lg, backgroundColor: "#101224" },
  header: { minHeight: 72, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: "#142532" },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.violetSoft, fontSize: 8, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: colors.text, fontSize: 17, fontWeight: "800" },
  count: { color: colors.cyan, fontSize: 13, fontWeight: "900" },
  closeButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.surfaceRaised },
  track: { height: 3, marginHorizontal: spacing.md, overflow: "hidden", borderRadius: 2, backgroundColor: colors.border },
  fill: { height: "100%", borderRadius: 2, backgroundColor: colors.cyan },
  steps: { padding: spacing.sm, gap: 4 },
  step: { minHeight: 62, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: "transparent", borderRadius: radius.md },
  nextStep: { borderColor: "#6556ad", backgroundColor: "#1a1932" },
  doneStep: { opacity: 0.76 },
  stepIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: colors.surfaceRaised },
  nextIcon: { backgroundColor: colors.violet },
  doneIcon: { backgroundColor: "#12302f" },
  stepCopy: { flex: 1, gap: 2 },
  stepTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  doneText: { color: colors.textMuted, textDecorationLine: "line-through" },
  stepBody: { color: colors.textMuted, fontSize: 10, lineHeight: 15 },
  offline: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, color: colors.gold, fontSize: 11, textAlign: "center" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
});
