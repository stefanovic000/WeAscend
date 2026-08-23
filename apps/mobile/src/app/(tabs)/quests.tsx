import { Ionicons } from "@expo/vector-icons";
import { localDateKey } from "@weascend/shared";
import { type Href, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CloudStateMessage } from "@/components/CloudStateMessage";
import { PageHeader } from "@/components/PageHeader";
import { OnboardingTarget } from "@/components/OnboardingTarget";
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
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const calendarDays = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const leadingEmptyDays = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from<null>({ length: leadingEmptyDays }).fill(null),
      ...Array.from({ length: daysInMonth }, (_, index) => new Date(year, month, index + 1)),
    ];
  }, [visibleMonth]);

  if (!state) {
    return (
      <Screen>
        <PageHeader eyebrow="MISSION LOG" title={sr ? "Questovi" : "Quests"} />
        <CloudStateMessage />
      </Screen>
    );
  }

  const selectedDateKey = localDateKey(selectedDate);
  const todayKey = localDateKey(new Date());
  const visibleQuests = state.quests
    .filter(quest => quest.status !== "archived" && localDateKey(quest.date) === selectedDateKey)
    .sort((left, right) => left.date.localeCompare(right.date));
  const questDays = new Map<string, { count: number; boss: boolean }>();
  for (const quest of state.quests) {
    if (quest.status === "archived") continue;
    const key = localDateKey(quest.date);
    if (!key) continue;
    const current = questDays.get(key) ?? { count: 0, boss: false };
    questDays.set(key, { count: current.count + 1, boss: current.boss || quest.type === "Boss" });
  }
  const locale = sr ? "sr-RS" : "en-US";
  const monthLabel = visibleMonth.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const selectedLabel = selectedDate.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  const weekdayLabels = sr ? ["P", "U", "S", "Č", "P", "S", "N"] : ["M", "T", "W", "T", "F", "S", "S"];
  const createForSelectedDate = () => router.push(`/quest/new?date=${encodeURIComponent(selectedDateKey)}` as Href);

  const changeMonth = (offset: number) => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    setVisibleMonth(next);
    setSelectedDate(next);
  };

  const returnToToday = () => {
    const today = new Date();
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  };

  return (
    <Screen>
      <PageHeader
        eyebrow="MISSION PLANNER"
        title={sr ? "Planer questova" : "Quest planner"}
        description={sr ? "Izaberi dan, vidi misije i planiraj unapred." : "Choose a day, review missions, and plan ahead."}
      />

      <View style={styles.calendarCard}>
        <OnboardingTarget targetId="planner_calendar" style={styles.monthHeader}>
          <Pressable accessibilityLabel={sr ? "Prethodni mesec" : "Previous month"} onPress={() => changeMonth(-1)} style={styles.monthButton}>
            <Ionicons color={colors.violetSoft} name="chevron-back" size={20} />
          </Pressable>
          <Pressable onPress={returnToToday} style={styles.monthTitleButton}>
            <Text style={styles.monthTitle}>{monthLabel}</Text>
            <Text style={styles.todayHint}>{sr ? "Dodirni za danas" : "Tap for today"}</Text>
          </Pressable>
          <Pressable accessibilityLabel={sr ? "Sledeći mesec" : "Next month"} onPress={() => changeMonth(1)} style={styles.monthButton}>
            <Ionicons color={colors.violetSoft} name="chevron-forward" size={20} />
          </Pressable>
        </OnboardingTarget>
        <View style={styles.calendarGrid}>
          {weekdayLabels.map((label, index) => <View key={`${label}-${index}`} style={styles.calendarCellSlot}><Text style={styles.weekday}>{label}</Text></View>)}
          {calendarDays.map((day, index) => {
            if (!day) return <View key={`empty-${index}`} style={styles.calendarCellSlot} />;
            const key = localDateKey(day);
            const activity = questDays.get(key);
            const selected = key === selectedDateKey;
            const today = key === todayKey;
            return (
              <View key={key} style={styles.calendarCellSlot}>
                <Pressable
                  accessibilityHint={sr ? "Duži pritisak odmah pravi quest za ovaj dan" : "Long press creates a quest for this day"}
                  accessibilityLabel={`${day.toLocaleDateString(locale)}${activity ? `, ${activity.count} ${sr ? "questova" : "quests"}` : ""}`}
                  onLongPress={() => {
                    if (offline) return;
                    setSelectedDate(day);
                    router.push(`/quest/new?date=${encodeURIComponent(key)}` as Href);
                  }}
                  onPress={() => setSelectedDate(day)}
                  style={({ pressed }) => [styles.dayButton, selected && styles.daySelected, activity?.boss && styles.bossDay, pressed && styles.dayPressed]}
                >
                  <Text style={[styles.dayText, selected && styles.dayTextSelected, today && styles.todayText]}>{day.getDate()}</Text>
                  {activity ? <View style={[styles.activityDot, activity.boss && styles.bossDot]} /> : null}
                </Pressable>
              </View>
            );
          })}
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}><View style={styles.activityDot} /><Text style={styles.legendText}>{sr ? "Quest" : "Quest"}</Text></View>
          <View style={styles.legendItem}><View style={[styles.activityDot, styles.bossDot]} /><Text style={styles.legendText}>Boss</Text></View>
        </View>
      </View>

      <View style={styles.selectedHeader}>
        <View style={styles.selectedCopy}>
          <Text style={styles.selectedEyebrow}>{selectedDateKey === todayKey ? (sr ? "DANAS" : "TODAY") : (sr ? "IZABRANI DAN" : "SELECTED DAY")}</Text>
          <Text style={styles.selectedTitle}>{selectedLabel}</Text>
        </View>
        <Text style={styles.questCount}>{visibleQuests.length}</Text>
      </View>
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
          <PrimaryButton disabled={offline} label={sr ? "Dodaj quest za ovaj dan" : "Add quest for this day"} onPress={createForSelectedDate} />
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons color={colors.violetSoft} name="map-outline" size={34} />
          <Text style={styles.emptyTitle}>{sr ? "Nema questova ovog dana" : "No quests on this day"}</Text>
          <Text style={styles.emptyBody}>{sr ? "Isplaniraj konkretnu misiju ili izaberi drugi datum." : "Plan a concrete mission or choose another date."}</Text>
          <PrimaryButton disabled={offline} label={sr ? "Dodaj quest za ovaj dan" : "Add quest for this day"} onPress={createForSelectedDate} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  calendarCard: { marginBottom: spacing.lg, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  monthHeader: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  monthButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceRaised },
  monthTitleButton: { flex: 1, alignItems: "center", gap: 2 },
  monthTitle: { color: colors.text, fontSize: 17, fontWeight: "700", textTransform: "capitalize" },
  todayHint: { color: colors.textMuted, fontSize: 9, fontWeight: "600" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", paddingTop: spacing.xs },
  calendarCellSlot: { width: "14.2857%", padding: 2 },
  weekday: { paddingVertical: 6, color: colors.textMuted, textAlign: "center", fontSize: 10, fontWeight: "800" },
  dayButton: { aspectRatio: 1, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 12, borderWidth: 1, borderColor: "transparent" },
  daySelected: { borderColor: colors.violetSoft, backgroundColor: "#282047" },
  bossDay: { borderColor: "#673044" },
  dayPressed: { opacity: 0.72, transform: [{ scale: 0.94 }] },
  dayText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  dayTextSelected: { color: colors.text },
  todayText: { color: colors.cyan },
  activityDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.violetSoft },
  bossDot: { backgroundColor: colors.danger },
  legendRow: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.md, paddingHorizontal: spacing.xs, paddingTop: spacing.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendText: { color: colors.textMuted, fontSize: 10 },
  selectedHeader: { marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  selectedCopy: { flex: 1, gap: 3 },
  selectedEyebrow: { color: colors.violetSoft, fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  selectedTitle: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: "700", textTransform: "capitalize" },
  questCount: { minWidth: 34, height: 34, paddingHorizontal: spacing.sm, textAlign: "center", textAlignVertical: "center", color: colors.text, fontSize: 13, fontWeight: "800", borderRadius: 17, backgroundColor: colors.surfaceRaised },
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
