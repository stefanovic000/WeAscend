import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { localDateKey, type QuestTemplate } from "@weascend/shared";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { CloudStateMessage } from "@/components/CloudStateMessage";
import { Screen } from "@/components/Screen";
import { useCloudState } from "@/providers/CloudStateProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, radius, spacing } from "@/theme";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
type Schedule = QuestTemplate["schedule"];

export default function TemplateEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { state, offline, saving, saveState } = useCloudState();
  const { language } = usePreferences();
  const sr = language === "sr";
  const [draft, setDraft] = useState<QuestTemplate | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const hydratedId = useRef<string | null>(null);
  const original = useRef<QuestTemplate | null>(null);

  const template = state?.questTemplates?.find(item => item.id === id);

  useEffect(() => {
    if (!template || hydratedId.current === template.id) return;
    hydratedId.current = template.id;
    original.current = template;
    setDraft({ ...template, weekdays: [...template.weekdays] });
  }, [template]);

  if (!state) return <Screen><CloudStateMessage /></Screen>;
  if (!template || !draft) {
    return <Screen><View style={styles.missing}><Ionicons color={colors.textMuted} name="copy-outline" size={34} /><Text style={styles.title}>{sr ? "Template nije pronađen" : "Template not found"}</Text></View></Screen>;
  }

  const names = sr ? ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const timeValue = timeAsDate(draft.time);
  const path = `${state.attributes.find(item => item.id === draft.attributeId)?.name ?? "—"} › ${state.skills.find(item => item.id === draft.skillId)?.name ?? "—"}`;

  const update = (patch: Partial<QuestTemplate>) => {
    setDraft(current => current ? { ...current, ...patch } : current);
    setError("");
  };

  const save = async () => {
    if (offline || saving) return;
    if (!draft.title.trim()) {
      setError(sr ? "Naziv je obavezan." : "A title is required.");
      return;
    }
    if (draft.schedule === "weekly" && draft.weekdays.length === 0) {
      setError(sr ? "Izaberi bar jedan dan." : "Choose at least one day.");
      return;
    }
    const scheduleChanged = Boolean(original.current && (
      original.current.schedule !== draft.schedule ||
      original.current.intervalDays !== draft.intervalDays ||
      original.current.weekdays.join(",") !== draft.weekdays.join(",")
    ));
    const saved: QuestTemplate = {
      ...draft,
      title: draft.title.trim(),
      description: draft.description.trim(),
      completionConditions: draft.completionConditions.trim(),
      intervalDays: Math.max(2, Math.min(365, Math.round(draft.intervalDays ?? 2))),
      startDate: scheduleChanged ? localDateKey(new Date()) : draft.startDate,
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveState({ ...state, questTemplates: (state.questTemplates ?? []).map(item => item.id === saved.id ? saved : item) });
      router.back();
    } catch {
      setError(sr ? "Promena nije sačuvana. Potvrđeni cloud podaci su ostali isti." : "The change was not saved. Confirmed cloud data stayed unchanged.");
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      sr ? "Obrisati template?" : "Delete template?",
      sr ? "Buduće instance se više neće praviti. Već napravljeni i završeni questovi ostaju netaknuti." : "Future instances will stop. Existing and completed quests remain untouched.",
      [
        { text: sr ? "Odustani" : "Cancel", style: "cancel" },
        { text: sr ? "Obriši" : "Delete", style: "destructive", onPress: () => void (async () => {
          try {
            await saveState({ ...state, questTemplates: (state.questTemplates ?? []).filter(item => item.id !== draft.id) });
            router.replace("/templates" as Href);
          } catch {
            setError(sr ? "Template nije obrisan." : "The template was not deleted.");
          }
        })() },
      ],
    );
  };

  const changeTime = (_event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === "android") setPickerOpen(false);
    if (value) update({ time: `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}` });
  };

  return (
    <Screen keyboardAware>
      <Text style={styles.eyebrow}>{sr ? "BUDUĆE INSTANCE" : "FUTURE INSTANCES"}</Text>
      <Text style={styles.title}>{sr ? "Uredi template" : "Edit template"}</Text>
      <Text style={styles.body}>{sr ? "Promene važe samo za questove koji će tek biti napravljeni." : "Changes apply only to quests created in the future."}</Text>
      <View style={styles.pathCard}><Ionicons color={colors.cyan} name="git-network-outline" size={19} /><Text style={styles.path}>{path}</Text><Text style={styles.xp}>{draft.xp} XP</Text></View>

      <Field label={sr ? "Naziv" : "Title"} maxLength={150} onChangeText={value => update({ title: value })} spellCheck={state.settings.spellcheck !== false} value={draft.title} />
      <Field label={sr ? "Opis" : "Description"} maxLength={3_000} multiline onChangeText={value => update({ description: value })} spellCheck={state.settings.spellcheck !== false} value={draft.description} />
      <Field label={sr ? "Završeno znači" : "Done means"} maxLength={500} multiline onChangeText={value => update({ completionConditions: value })} spellCheck={state.settings.spellcheck !== false} value={draft.completionConditions} />

      <Text style={styles.label}>{sr ? "RASPORED" : "SCHEDULE"}</Text>
      <View style={styles.chips}>{(["none", "daily", "weekly", "interval"] as Schedule[]).map(schedule => (
        <Chip key={schedule} active={draft.schedule === schedule} label={scheduleLabel(schedule, sr)} onPress={() => update({ schedule, weekdays: schedule === "weekly" && draft.weekdays.length === 0 ? [new Date().getDay()] : draft.weekdays })} />
      ))}</View>

      {draft.schedule === "weekly" ? <View style={styles.weekdays}>{WEEKDAYS.map((day, index) => (
        <Pressable key={day} onPress={() => update({ weekdays: draft.weekdays.includes(day) ? draft.weekdays.filter(item => item !== day) : [...draft.weekdays, day] })} style={[styles.day, draft.weekdays.includes(day) && styles.dayActive]}>
          <Text style={[styles.dayLabel, draft.weekdays.includes(day) && styles.dayLabelActive]}>{names[index]}</Text>
        </Pressable>
      ))}</View> : null}

      {draft.schedule === "interval" ? (
        <View style={styles.intervalRow}><Text style={styles.intervalText}>{sr ? "Napravi quest svakih" : "Create a quest every"}</Text><TextInput keyboardType="number-pad" maxLength={3} onChangeText={value => update({ intervalDays: Math.max(2, Math.min(365, Number(value) || 2)) })} style={styles.intervalInput} value={String(draft.intervalDays ?? 2)} /><Text style={styles.intervalText}>{sr ? "dana" : "days"}</Text></View>
      ) : null}

      <Text style={styles.label}>{sr ? "VREME" : "TIME"}</Text>
      <Pressable onPress={() => setPickerOpen(true)} style={styles.timeButton}><Ionicons color={colors.violetSoft} name="time-outline" size={21} /><Text style={styles.timeText}>{draft.time}</Text><Ionicons color={colors.textMuted} name="chevron-down" size={17} /></Pressable>
      {pickerOpen ? <View style={styles.picker}><DateTimePicker display="default" mode="time" onChange={changeTime} value={timeValue} />{Platform.OS === "ios" ? <Pressable onPress={() => setPickerOpen(false)}><Text style={styles.done}>Done</Text></Pressable> : null}</View> : null}

      <Text style={styles.label}>{sr ? "ROK ZA ZAVRŠETAK" : "COMPLETION WINDOW"}</Text>
      <View style={styles.chips}>{[0, 30, 60, 120].map(minutes => <Chip key={minutes} active={draft.deadlineOffsetMinutes === minutes} label={minutes ? `${minutes} min` : (sr ? "Bez roka" : "No window")} onPress={() => update({ deadlineOffsetMinutes: minutes })} />)}</View>
      <Text style={styles.hint}>{sr ? "Rok je samo informativan i nikada ne oduzima XP." : "The window is informational and never removes XP."}</Text>

      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      <Pressable disabled={offline || saving} onPress={() => void save()} style={[styles.save, (offline || saving) && styles.disabled]}><Ionicons color={colors.text} name="checkmark" size={20} /><Text style={styles.saveLabel}>{saving ? (sr ? "Čuvam…" : "Saving…") : (sr ? "Sačuvaj buduće instance" : "Save future instances")}</Text></Pressable>
      <Pressable disabled={offline || saving} onPress={confirmDelete} style={[styles.delete, (offline || saving) && styles.disabled]}><Ionicons color={colors.danger} name="trash-outline" size={18} /><Text style={styles.deleteLabel}>{sr ? "Obriši template" : "Delete template"}</Text></Pressable>
    </Screen>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const length = typeof props.value === "string" ? props.value.length : 0;
  const { label, multiline, ...inputProps } = props;
  return <View style={styles.field}><View style={styles.fieldTop}><Text style={styles.label}>{label.toUpperCase()}</Text><Text style={styles.counter}>{length}/{props.maxLength}</Text></View><TextInput {...inputProps} multiline={multiline} placeholderTextColor={colors.textMuted} style={[styles.input, multiline && styles.textarea]} /></View>;
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text></Pressable>;
}

function scheduleLabel(schedule: Schedule, sr: boolean) {
  if (schedule === "daily") return sr ? "Svaki dan" : "Daily";
  if (schedule === "weekly") return sr ? "Izabrani dani" : "Selected days";
  if (schedule === "interval") return sr ? "Svakih N dana" : "Every N days";
  return sr ? "Ručno" : "Manual";
}

function timeAsDate(time: string) {
  const date = new Date();
  const [hour, minute] = time.split(":").map(Number);
  date.setHours(hour || 0, minute || 0, 0, 0);
  return date;
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.violetSoft, fontSize: 10, fontWeight: "800", letterSpacing: 1.7 },
  title: { marginTop: spacing.xs, color: colors.text, fontSize: 27, fontWeight: "800" },
  body: { marginTop: spacing.xs, color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  pathCard: { marginTop: spacing.md, minHeight: 50, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  path: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "700" },
  xp: { color: colors.cyan, fontSize: 13, fontWeight: "800" },
  field: { marginTop: spacing.md, gap: spacing.xs },
  fieldTop: { flexDirection: "row", justifyContent: "space-between" },
  label: { marginTop: spacing.md, color: colors.violetSoft, fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  counter: { color: colors.textMuted, fontSize: 9, opacity: 0.65 },
  input: { minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: 13, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  textarea: { minHeight: 96, textAlignVertical: "top" },
  chips: { marginTop: spacing.sm, flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.surface },
  chipActive: { borderColor: colors.violet, backgroundColor: "#201b42" },
  chipLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  chipLabelActive: { color: colors.text },
  weekdays: { marginTop: spacing.sm, flexDirection: "row", justifyContent: "space-between", gap: 4 },
  day: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  dayActive: { borderColor: colors.cyan, backgroundColor: "#10242d" },
  dayLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  dayLabelActive: { color: colors.cyan },
  intervalRow: { marginTop: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  intervalText: { color: colors.textMuted, fontSize: 12 },
  intervalInput: { width: 58, minHeight: 38, color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "center", borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  timeButton: { marginTop: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  timeText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "800" },
  picker: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface },
  done: { padding: spacing.sm, color: colors.cyan, textAlign: "right", fontWeight: "800" },
  hint: { marginTop: spacing.xs, color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  error: { marginTop: spacing.md, color: colors.danger, fontSize: 12, lineHeight: 18, textAlign: "center" },
  save: { marginTop: spacing.lg, minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.violet },
  saveLabel: { color: colors.text, fontSize: 14, fontWeight: "800" },
  delete: { marginTop: spacing.sm, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1, borderColor: "#6c2f42", borderRadius: radius.md },
  deleteLabel: { color: colors.danger, fontSize: 13, fontWeight: "700" },
  missing: { padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  disabled: { opacity: 0.42 },
});
