import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CloudStateMessage } from "@/components/CloudStateMessage";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { useCloudState } from "@/providers/CloudStateProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, radius, spacing } from "@/theme";

export default function TemplatesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string | string[] }>();
  const useMode = (Array.isArray(params.mode) ? params.mode[0] : params.mode) === "use";
  const { state, offline } = useCloudState();
  const { language } = usePreferences();
  const sr = language === "sr";

  if (!state) return <Screen><CloudStateMessage /></Screen>;

  const attributes = new Map(state.attributes.map(item => [item.id, item.name]));
  const skills = new Map(state.skills.map(item => [item.id, item.name]));
  const templates = [...(state.questTemplates ?? [])].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return (
    <Screen>
      <PageHeader
        eyebrow={useMode ? (sr ? "IZABERI OSNOVU" : "CHOOSE A START") : (sr ? "PREČICE" : "SHORTCUTS")}
        title={useMode ? (sr ? "Koristi template" : "Use a template") : (sr ? "Quest template-i" : "Quest templates")}
      />
      <Text style={styles.intro}>{useMode
        ? (sr ? "Izaberi template. Možeš ga koristiti više puta istog dana i svaki quest promeniti pre aktivacije." : "Choose a template. You can use it several times on the same day and edit every quest before activation.")
        : (sr ? "Ovde se čuvaju samo osnove i rasporedi. Pojedinačne instance ostaju među questovima." : "Only foundations and schedules live here. Individual instances stay with your quests.")}
      </Text>

      {templates.length ? <View style={styles.list}>{templates.map(template => {
        const pathAvailable = attributes.has(template.attributeId) && skills.has(template.skillId);
        return (
          <View key={template.id} style={[styles.card, !pathAvailable && styles.invalidCard]}>
            <View style={styles.cardTop}>
              <View style={styles.templateIcon}><Ionicons color={pathAvailable ? colors.cyan : colors.danger} name="copy-outline" size={21} /></View>
              <View style={styles.copy}>
                <Text numberOfLines={2} style={styles.title}>{template.title}</Text>
                <Text style={styles.path}>{attributes.get(template.attributeId) ?? (sr ? "Obrisana oblast" : "Deleted area")} › {skills.get(template.skillId) ?? (sr ? "Obrisan skill" : "Deleted skill")}</Text>
              </View>
              <Text style={styles.xp}>{template.xp} XP</Text>
            </View>
            <View style={styles.scheduleRow}>
              <Ionicons color={colors.violetSoft} name="repeat-outline" size={16} />
              <Text style={styles.schedule}>{scheduleText(template.schedule, template.intervalDays, template.weekdays, sr)}</Text>
              <Text style={styles.time}>{template.time}</Text>
            </View>
            {!pathAvailable ? <Text style={styles.invalidText}>{sr ? "Ponovo poveži oblast i skill pre korišćenja." : "Reconnect its area and skill before using it."}</Text> : null}
            <View style={styles.actions}>
              <Pressable
                disabled={offline || !pathAvailable}
                onPress={() => router.push({ pathname: "/quest/new", params: { templateId: template.id } } as Href)}
                style={[styles.useButton, (offline || !pathAvailable) && styles.disabled]}
              >
                <Ionicons color={colors.text} name="flash-outline" size={17} /><Text style={styles.useLabel}>{sr ? "Koristi" : "Use"}</Text>
              </Pressable>
              <Pressable onPress={() => router.push(`/template/${encodeURIComponent(template.id)}` as Href)} style={styles.editButton}>
                <Ionicons color={colors.violetSoft} name="options-outline" size={18} /><Text style={styles.editLabel}>{sr ? "Uredi" : "Manage"}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}</View> : (
        <View style={styles.empty}>
          <Ionicons color={colors.violetSoft} name="copy-outline" size={38} />
          <Text style={styles.emptyTitle}>{sr ? "Još nema template-a" : "No templates yet"}</Text>
          <Text style={styles.emptyBody}>{sr ? "Otvori postojeći quest i izaberi „Sačuvaj kao template“." : "Open an existing quest and choose “Save as template”."}</Text>
          <Pressable disabled={offline} onPress={() => router.replace("/quest/new")} style={[styles.newButton, offline && styles.disabled]}><Text style={styles.newLabel}>{sr ? "Napravi prvi quest" : "Create your first quest"}</Text></Pressable>
        </View>
      )}
    </Screen>
  );
}

function scheduleText(schedule: "none" | "daily" | "weekly" | "interval", intervalDays: number | undefined, weekdays: number[], sr: boolean) {
  if (schedule === "daily") return sr ? "Automatski svaki dan" : "Automatically every day";
  if (schedule === "interval") return sr ? `Automatski svakih ${intervalDays ?? 2} dana` : `Automatically every ${intervalDays ?? 2} days`;
  if (schedule === "weekly") {
    const names = (sr ? ["Ned", "Pon", "Uto", "Sre", "Čet", "Pet", "Sub"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    return weekdays.length ? weekdays.map(day => names[day]).join(", ") : (sr ? "Izaberi dane" : "Choose days");
  }
  return sr ? "Samo ručno korišćenje" : "Manual use only";
}

const styles = StyleSheet.create({
  intro: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  list: { marginTop: spacing.md, gap: spacing.md },
  card: { padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  invalidCard: { borderColor: "#6c2f42" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  templateIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#10242d" },
  copy: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: 15, fontWeight: "800" },
  path: { color: colors.textMuted, fontSize: 10 },
  xp: { color: colors.cyan, fontSize: 14, fontWeight: "800" },
  scheduleRow: { minHeight: 34, paddingHorizontal: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  schedule: { flex: 1, color: colors.text, fontSize: 11, fontWeight: "600" },
  time: { color: colors.violetSoft, fontSize: 11, fontWeight: "800" },
  invalidText: { color: colors.danger, fontSize: 11, lineHeight: 16 },
  actions: { flexDirection: "row", gap: spacing.sm },
  useButton: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.violet },
  useLabel: { color: colors.text, fontSize: 13, fontWeight: "800" },
  editButton: { minHeight: 44, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  editLabel: { color: colors.violetSoft, fontSize: 12, fontWeight: "700" },
  empty: { marginTop: spacing.xl, padding: spacing.xl, alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  emptyBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  newButton: { marginTop: spacing.sm, minHeight: 46, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.violet },
  newLabel: { color: colors.text, fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.42 },
});
