import { Ionicons } from "@expo/vector-icons";
import { type BossAttempt } from "@weascend/shared";
import { type Href, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CloudStateMessage } from "@/components/CloudStateMessage";
import { PageHeader } from "@/components/PageHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { useCloudState } from "@/providers/CloudStateProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, radius, spacing } from "@/theme";

function formatDate(value: string, language: "en" | "sr") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(language === "sr" ? "sr-RS" : "en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function BossQuestsScreen() {
  const router = useRouter();
  const { state, offline } = useCloudState();
  const { language } = usePreferences();
  const sr = language === "sr";

  if (!state) return <Screen><PageHeader eyebrow="BOSS QUESTS" title={sr ? "Boss questovi" : "Boss Quests"} /><CloudStateMessage /></Screen>;

  const bosses = state.quests
    .filter(quest => quest.type === "Boss" && quest.status !== "archived")
    .sort((left, right) => Number(left.status === "completed") - Number(right.status === "completed") || left.date.localeCompare(right.date));
  const activeCount = bosses.filter(boss => boss.status === "active").length;
  const clearedCount = bosses.filter(boss => boss.status === "completed").length;

  return (
    <Screen>
      <PageHeader
        badge={`${activeCount} ${sr ? "AKTIVNIH" : "ACTIVE"}`}
        description={sr ? "Veliki stvarni izazovi sa pripremnim koracima i merljivim rezultatom." : "Major real-world challenges with preparation steps and a measurable result."}
        eyebrow="BOSS QUESTS"
        title={sr ? "Boss questovi" : "Boss Quests"}
      />

      <View style={styles.summary}>
        <Summary icon="shield-outline" label={sr ? "Aktivni" : "Active"} value={activeCount} />
        <Summary icon="trophy-outline" label={sr ? "Završeni" : "Cleared"} value={clearedCount} />
        <Summary icon="layers-outline" label={sr ? "Ukupno" : "Total"} value={bosses.length} />
      </View>

      <PrimaryButton disabled={offline} label={sr ? "Planiraj Boss quest" : "Plan a Boss Quest"} onPress={() => router.push("/quest/new?type=Boss")} />

      {bosses.length ? <View style={styles.list}>{bosses.map(boss => {
        const steps = state.quests
          .filter(quest => quest.parentQuestId === boss.id)
          .sort((left, right) => (left.stepOrder ?? 0) - (right.stepOrder ?? 0) || left.createdAt.localeCompare(right.createdAt));
        const completedSteps = steps.filter(step => step.status === "completed" || step.archivedFromStatus === "completed").length;
        const attempts = (state.bossAttempts ?? [])
          .filter((attempt): attempt is BossAttempt => Boolean(attempt && attempt.bossQuestId === boss.id && !attempt.reversedAt))
          .sort((left, right) => right.attemptNumber - left.attemptNumber);
        const attribute = state.attributes.find(item => item.id === boss.attributeId);
        const skill = state.skills.find(item => item.id === boss.skillId);
        const cleared = boss.status === "completed";
        const progress = steps.length ? (completedSteps / steps.length) * 100 : 0;
        return (
          <View key={boss.id} style={[styles.card, cleared && styles.clearedCard]}>
            <View style={styles.cardTop}>
              <View style={[styles.statusIcon, cleared && styles.clearedIcon]}><Ionicons color={cleared ? colors.cyan : colors.gold} name={cleared ? "trophy-outline" : "shield-outline"} size={22} /></View>
              <View style={styles.cardHeading}>
                <Text style={[styles.status, cleared && styles.clearedText]}>{cleared ? (sr ? "ZAVRŠEN" : "CLEARED") : attempts.length ? `${sr ? "AKTIVAN" : "ACTIVE"} · ${attempts.length} ${sr ? "POKUŠAJA" : "ATTEMPTS"}` : (sr ? "AKTIVAN" : "ACTIVE")}</Text>
                <Text style={styles.date}>{formatDate(boss.date, language)}</Text>
              </View>
              <Text style={styles.reward}>+{boss.xp} XP</Text>
            </View>

            <Text style={styles.title}>{boss.title}</Text>
            <Text style={styles.path}>{attribute?.name ?? (sr ? "Obrisana oblast" : "Deleted area")} › {skill?.name ?? (sr ? "Obrisan skill" : "Deleted skill")}</Text>

            <View style={styles.conditions}>
              <Condition label={sr ? "CILJ" : "OBJECTIVE"} value={boss.description || (sr ? "Nema dodatnog opisa." : "No additional description.")} />
              <Condition label={sr ? "USLOV ZAVRŠETKA" : "CLEAR CONDITION"} value={boss.completionConditions || (sr ? "Definiši merljiv rezultat." : "Define a measurable result.")} />
            </View>

            <View style={styles.preparationHeader}>
              <View><Text style={styles.preparationEyebrow}>{sr ? "PRIPREMA" : "PREPARATION"}</Text><Text style={styles.preparationCount}>{completedSteps}/{steps.length} {sr ? "koraka" : "steps"}</Text></View>
              {!cleared ? <Pressable disabled={offline} onPress={() => router.push(`/quest/new?parentQuestId=${encodeURIComponent(boss.id)}` as Href)} style={[styles.addStep, offline && styles.disabled]}><Ionicons color={colors.violetSoft} name="add" size={17} /><Text style={styles.addStepText}>{sr ? "Dodaj korak" : "Add step"}</Text></Pressable> : null}
            </View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>

            {steps.length ? <View style={styles.stepList}>{steps.map(step => (
              <Pressable key={step.id} onPress={() => router.push(`/quest/${encodeURIComponent(step.id)}` as Href)} style={({ pressed }) => [styles.step, pressed && styles.pressed]}>
                <Ionicons color={step.status === "completed" || step.archivedFromStatus === "completed" ? colors.cyan : step.status === "failed" ? colors.danger : colors.textMuted} name={step.status === "completed" || step.archivedFromStatus === "completed" ? "checkmark-circle" : step.status === "failed" ? "close-circle-outline" : "ellipse-outline"} size={18} />
                <Text numberOfLines={1} style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepXp}>{step.xp} XP</Text>
              </Pressable>
            ))}</View> : <Text style={styles.noSteps}>{sr ? "Još nema pripremnih koraka." : "No preparation steps yet."}</Text>}

            {attempts[0] ? <View style={styles.latestAttempt}><Text style={[styles.attemptLabel, attempts[0].outcome === "failed" && styles.failedText]}>{attempts[0].outcome === "cleared" ? "BOSS CLEAR" : (sr ? `POKUŠAJ #${attempts[0].attemptNumber}` : `ATTEMPT #${attempts[0].attemptNumber}`)}</Text><Text numberOfLines={2} style={styles.attemptResult}>{attempts[0].result}</Text></View> : null}

            <Pressable onPress={() => router.push(`/quest/${encodeURIComponent(boss.id)}` as Href)} style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}>
              <Text style={styles.openText}>{sr ? "Otvori Boss quest" : "Open Boss Quest"}</Text><Ionicons color={colors.text} name="chevron-forward" size={18} />
            </Pressable>
          </View>
        );
      })}</View> : (
        <View style={styles.empty}>
          <Ionicons color={colors.gold} name="shield-outline" size={38} />
          <Text style={styles.emptyTitle}>{sr ? "Još nema Boss questova" : "No Boss Quests yet"}</Text>
          <Text style={styles.emptyBody}>{sr ? "Koristi ih za ispit, projekat, takmičenje ili drugu veliku proveru sposobnosti." : "Use them for an exam, project, competition, or another major test of ability."}</Text>
        </View>
      )}
    </Screen>
  );
}

function Summary({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) {
  return <View style={styles.summaryItem}><Ionicons color={colors.violetSoft} name={icon} size={18} /><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

function Condition({ label, value }: { label: string; value: string }) {
  return <View style={styles.condition}><Text style={styles.conditionLabel}>{label}</Text><Text style={styles.conditionValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  summary: { marginBottom: spacing.md, flexDirection: "row", gap: spacing.sm },
  summaryItem: { minHeight: 78, flex: 1, padding: spacing.sm, alignItems: "center", justifyContent: "center", gap: 3, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  summaryValue: { color: colors.text, fontSize: 19, fontWeight: "900" },
  summaryLabel: { color: colors.textMuted, fontSize: 9, fontWeight: "700" },
  list: { marginTop: spacing.lg, gap: spacing.md },
  card: { overflow: "hidden", padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: "#66522d", borderRadius: radius.lg, backgroundColor: "#12121f" },
  clearedCard: { borderColor: "#28645f", backgroundColor: "#0e171b" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: "#292117" },
  clearedIcon: { backgroundColor: "#12302f" },
  cardHeading: { flex: 1, gap: 3 },
  status: { color: colors.gold, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  clearedText: { color: colors.cyan },
  date: { color: colors.textMuted, fontSize: 10 },
  reward: { color: colors.gold, fontSize: 14, fontWeight: "900" },
  title: { color: colors.text, fontSize: 22, lineHeight: 27, fontWeight: "800" },
  path: { color: colors.textMuted, fontSize: 11 },
  conditions: { gap: spacing.xs, paddingVertical: spacing.xs },
  condition: { gap: 3, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface },
  conditionLabel: { color: colors.violetSoft, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  conditionValue: { color: colors.text, fontSize: 12, lineHeight: 18 },
  preparationHeader: { marginTop: spacing.xs, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  preparationEyebrow: { color: colors.violetSoft, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  preparationCount: { marginTop: 3, color: colors.text, fontSize: 13, fontWeight: "700" },
  addStep: { minHeight: 38, paddingHorizontal: spacing.sm, flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill },
  addStepText: { color: colors.violetSoft, fontSize: 10, fontWeight: "800" },
  progressTrack: { height: 5, overflow: "hidden", borderRadius: 3, backgroundColor: colors.border },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: colors.cyan },
  stepList: { overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  step: { minHeight: 48, paddingHorizontal: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  stepTitle: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "700" },
  stepXp: { color: colors.textMuted, fontSize: 10 },
  noSteps: { paddingVertical: spacing.sm, color: colors.textMuted, fontSize: 11, textAlign: "center" },
  latestAttempt: { gap: 3, padding: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.violetSoft, backgroundColor: colors.surface },
  attemptLabel: { color: colors.cyan, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  failedText: { color: colors.danger },
  attemptResult: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  openButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.violet },
  openText: { color: colors.text, fontSize: 13, fontWeight: "800" },
  empty: { marginTop: spacing.lg, padding: spacing.xl, alignItems: "center", gap: spacing.sm, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.lg },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  emptyBody: { color: colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: "center" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
