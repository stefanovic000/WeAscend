import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useEffect } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCloudState } from "@/providers/CloudStateProvider";
import { useOnboarding } from "@/providers/OnboardingProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, radius, spacing } from "@/theme";

const steps = {
  en: [
    { route: "/", icon: "compass-outline", eyebrow: "COMMAND", title: "Your next mission", body: "Today keeps the important question visible: what should you do next? Rank and XP show long-term progress." },
    { route: "/progress", icon: "git-network-outline", eyebrow: "GROWTH PATH", title: "Area → Skill → Quest", body: "Start with a broad area such as Languages, add a skill such as Spanish, then connect concrete quests to it." },
    { route: "/progress", icon: "add-circle-outline", eyebrow: "CREATE", title: "Turn intent into action", body: "The central + button opens the guided quest creator. It asks what the quest improves before asking for the task." },
    { route: "/quests", icon: "calendar-outline", eyebrow: "PLAN", title: "Plan future days", body: "Choose any date to see its missions. Long press a day to create a quest there immediately. Boss dates glow red." },
    { route: "/", icon: "sparkles-outline", eyebrow: "READY", title: "The system is yours", body: "Keep it simple: create one meaningful quest, complete it honestly, and let progress accumulate." },
  ],
  sr: [
    { route: "/", icon: "compass-outline", eyebrow: "COMMAND", title: "Tvoja sledeća misija", body: "Today drži važno pitanje ispred tebe: šta je sledeće što treba da uradiš? Rank i XP prikazuju dugoročni napredak." },
    { route: "/progress", icon: "git-network-outline", eyebrow: "PUT NAPRETKA", title: "Oblast → Skill → Quest", body: "Počni širom oblasti kao Languages, dodaj skill kao Spanish, pa poveži konkretne questove sa njim." },
    { route: "/progress", icon: "add-circle-outline", eyebrow: "CREATE", title: "Pretvori nameru u akciju", body: "Centralno + dugme otvara vođeno pravljenje questa. Prvo biraš šta quest unapređuje, pa tek onda zadatak." },
    { route: "/quests", icon: "calendar-outline", eyebrow: "PLAN", title: "Planiraj buduće dane", body: "Izaberi datum da vidiš njegove misije. Duži pritisak odmah pravi quest za taj dan. Boss datumi svetle crveno." },
    { route: "/", icon: "sparkles-outline", eyebrow: "SPREMAN", title: "Sistem je tvoj", body: "Drži ga jednostavnim: napravi jedan smislen quest, završi ga iskreno i pusti da se napredak skuplja." },
  ],
} as const;

export function OnboardingTour() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { state } = useCloudState();
  const { active, step, totalSteps, next, back, skip } = useOnboarding();
  const { language } = usePreferences();
  const sr = language === "sr";
  const current = steps[language][step] ?? steps[language][0];

  useEffect(() => {
    if (active && state) router.replace(current.route as Href);
  }, [active, current.route, router, state]);

  if (!active || !state) return null;

  const highlight = step === 2
    ? { bottom: insets.bottom + 38, left: width / 2 - 38, width: 76, height: 76, borderRadius: 38 }
    : step === 3
      ? { bottom: insets.bottom + 8, left: width * 0.2 + 5, width: width * 0.2 - 10, height: 62, borderRadius: 18 }
      : step === 1
        ? { top: insets.top + 92, left: 14, right: 14, height: 310, borderRadius: 24 }
        : { top: insets.top + 92, left: 14, right: 14, height: 180, borderRadius: 24 };
  const promptAtTop = step === 2 || step === 3;

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={skip} statusBarTranslucent transparent visible>
      <View style={styles.overlay}>
        <View pointerEvents="none" style={[styles.highlight, highlight]} />
        <View style={[styles.card, promptAtTop ? { top: insets.top + 28 } : { bottom: insets.bottom + 94 }]}>
          <View style={styles.cardHeader}>
            <View style={styles.icon}><Ionicons color={colors.cyan} name={current.icon} size={22} /></View>
            <View style={styles.heading}><Text style={styles.eyebrow}>{current.eyebrow}</Text><Text style={styles.counter}>{step + 1} / {totalSteps}</Text></View>
            <Pressable accessibilityLabel={sr ? "Preskoči tutorijal" : "Skip tutorial"} onPress={skip} style={styles.skipButton}><Text style={styles.skip}>{sr ? "Preskoči" : "Skip"}</Text></Pressable>
          </View>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>
          <View style={styles.progress}>{Array.from({ length: totalSteps }, (_, index) => <View key={index} style={[styles.progressDot, index === step && styles.progressDotActive]} />)}</View>
          <View style={styles.actions}>
            {step > 0 ? <Pressable onPress={back} style={styles.backButton}><Ionicons color={colors.textMuted} name="arrow-back" size={18} /><Text style={styles.backText}>{sr ? "Nazad" : "Back"}</Text></Pressable> : <View />}
            <Pressable onPress={next} style={styles.nextButton}><Text style={styles.nextText}>{step === totalSteps - 1 ? (sr ? "Završi" : "Finish") : (sr ? "Nastavi" : "Next")}</Text><Ionicons color={colors.text} name={step === totalSteps - 1 ? "checkmark" : "arrow-forward"} size={18} /></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(3, 4, 12, 0.76)" },
  highlight: { position: "absolute", borderWidth: 2, borderColor: colors.cyan, backgroundColor: "rgba(49, 216, 212, 0.05)", shadowColor: colors.cyan, shadowOpacity: 0.7, shadowRadius: 16, elevation: 8 },
  card: { position: "absolute", left: spacing.md, right: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: "#574890", borderRadius: radius.lg, backgroundColor: "#111326" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  icon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: "#142532" },
  heading: { flex: 1, gap: 2 },
  eyebrow: { color: colors.violetSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  counter: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  skipButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: spacing.xs },
  skip: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  title: { marginTop: spacing.md, color: colors.text, fontSize: 22, lineHeight: 27, fontWeight: "800" },
  body: { marginTop: spacing.sm, color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  progress: { marginTop: spacing.md, flexDirection: "row", gap: spacing.xs },
  progressDot: { height: 4, flex: 1, borderRadius: 2, backgroundColor: colors.border },
  progressDotActive: { backgroundColor: colors.cyan },
  actions: { marginTop: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  backButton: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm },
  backText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  nextButton: { minHeight: 48, minWidth: 124, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.violet },
  nextText: { color: colors.text, fontSize: 14, fontWeight: "800" },
});
