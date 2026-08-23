import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { BackHandler, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCloudState } from "@/providers/CloudStateProvider";
import { useOnboarding, type OnboardingTargetRect } from "@/providers/OnboardingProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, radius, spacing } from "@/theme";

const steps = {
  en: [
    { route: "/", target: "today_progress", icon: "compass-outline", eyebrow: "COMMAND", title: "Your next mission", body: "Today shows what needs attention now. Rank and XP record long-term progress; they are not a daily score you can lose." },
    { route: "/progress", target: "growth_path", icon: "git-network-outline", eyebrow: "GROWTH PATH", title: "Area → Skill → Quest", body: "Structure comes first: Languages is an area, Spanish is its skill, and Study lesson 1 is a quest that improves it." },
    { route: "/progress", target: "create_quest", icon: "add-circle-outline", eyebrow: "CREATE", title: "Turn intent into action", body: "Press this + whenever you know the next concrete action. The guided creator connects it to the right area and skill." },
    { route: "/quests", target: "planner_calendar", icon: "calendar-outline", eyebrow: "PLAN", title: "Plan future days", body: "Tap a day to inspect it. Long press a day to create a quest there immediately. Boss dates are marked red." },
    { route: "/", target: null, icon: "sparkles-outline", eyebrow: "YOUR FIRST LOOP", title: "Do these three things", body: "1. Create one area and one skill.\n2. Press + and create one real quest.\n3. Return to Today and complete it when the work is done." },
  ],
  sr: [
    { route: "/", target: "today_progress", icon: "compass-outline", eyebrow: "COMMAND", title: "Tvoja sledeća misija", body: "Today pokazuje šta sada traži pažnju. Rank i XP beleže dugoročni napredak; nisu dnevni rezultat koji možeš izgubiti." },
    { route: "/progress", target: "growth_path", icon: "git-network-outline", eyebrow: "PUT NAPRETKA", title: "Oblast → Skill → Quest", body: "Prvo struktura: Languages je oblast, Spanish je njen skill, a Uči lekciju 1 je quest koji ga unapređuje." },
    { route: "/progress", target: "create_quest", icon: "add-circle-outline", eyebrow: "CREATE", title: "Pretvori nameru u akciju", body: "Pritisni ovo + dugme kada znaš sledeću konkretnu akciju. Vođeni unos je povezuje sa pravom oblašću i skillom." },
    { route: "/quests", target: "planner_calendar", icon: "calendar-outline", eyebrow: "PLAN", title: "Planiraj buduće dane", body: "Dodirni dan da ga pregledaš. Duži pritisak odmah pravi quest za taj datum. Boss datumi su označeni crveno." },
    { route: "/", target: null, icon: "sparkles-outline", eyebrow: "TVOJ PRVI KRUG", title: "Uradi ove tri stvari", body: "1. Napravi jednu oblast i jedan skill.\n2. Pritisni + i napravi jedan stvaran quest.\n3. Vrati se na Today i završi ga kada obaviš rad." },
  ],
} as const;

export function OnboardingTour() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const { state } = useCloudState();
  const { active, step, totalSteps, next, back, skip, measureTarget } = useOnboarding();
  const { language } = usePreferences();
  const [targetRect, setTargetRect] = useState<OnboardingTargetRect | null>(null);
  const overlayRef = useRef<View | null>(null);
  const sr = language === "sr";
  const current = steps[language][step] ?? steps[language][0];

  useEffect(() => {
    if (active && state) router.replace(current.route as Href);
  }, [active, current.route, router, state]);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setTargetRect(null);
    if (!active || !state || !current.target) return () => { cancelled = true; };

    const measure = async (attempt = 0) => {
      const overlayOrigin = await new Promise<{ x: number; y: number } | null>(resolve => {
        const overlay = overlayRef.current;
        if (!overlay) {
          resolve(null);
          return;
        }
        overlay.measureInWindow((x, y, measuredWidth, measuredHeight) => {
          resolve(measuredWidth > 0 && measuredHeight > 0 ? { x, y } : null);
        });
      });
      const rect = await measureTarget(current.target ?? "");
      if (cancelled) return;
      if (rect && overlayOrigin) {
        setTargetRect({
          x: rect.x - overlayOrigin.x,
          y: rect.y - overlayOrigin.y,
          width: rect.width,
          height: rect.height,
        });
      }
      else if (attempt < 5) timeout = setTimeout(() => void measure(attempt + 1), 120);
    };
    timeout = setTimeout(() => void measure(), 220);
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [active, current.route, current.target, measureTarget, state]);

  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      skip();
      return true;
    });
    return () => subscription.remove();
  }, [active, skip]);

  if (!active || !state) return null;

  const highlight = targetRect ? {
    top: Math.max(6, targetRect.y - 6),
    left: Math.max(6, targetRect.x - 6),
    width: Math.min(width - Math.max(6, targetRect.x - 6) - 6, targetRect.width + 12),
    height: targetRect.height + 12,
    borderRadius: Math.min(28, (targetRect.height + 12) / 2),
  } : null;
  const promptAtTop = targetRect ? targetRect.y > height / 2 : step === 2 || step === 3;
  const finish = () => {
    next();
    router.replace("/progress");
  };

  return (
    <View collapsable={false} ref={overlayRef} style={styles.overlay}>
      {highlight ? <View pointerEvents="none" style={[styles.highlight, highlight]} /> : null}
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
          <Pressable onPress={step === totalSteps - 1 ? finish : next} style={styles.nextButton}><Text style={styles.nextText}>{step === totalSteps - 1 ? (sr ? "Idi na oblasti" : "Go to Growth Areas") : (sr ? "Nastavi" : "Next")}</Text><Ionicons color={colors.text} name={step === totalSteps - 1 ? "git-network-outline" : "arrow-forward"} size={18} /></Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, elevation: 1000, backgroundColor: "rgba(3, 4, 12, 0.76)" },
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
  nextButton: { minHeight: 48, minWidth: 124, maxWidth: 210, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.violet },
  nextText: { color: colors.text, fontSize: 14, fontWeight: "800" },
});
