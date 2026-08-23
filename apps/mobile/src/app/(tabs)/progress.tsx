import { Ionicons } from "@expo/vector-icons";
import { activeXp, type GrowthCommand } from "@weascend/shared";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { CloudStateMessage } from "@/components/CloudStateMessage";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { useCloudState } from "@/providers/CloudStateProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, radius, spacing } from "@/theme";

const AREA_COLORS = ["#866bff", "#32d6c5", "#4ea5ff", "#ff6da8"];
type Editor =
  | { kind: "attribute"; mode: "create" | "rename"; id?: string; value: string }
  | { kind: "skill"; mode: "create" | "rename"; attributeId: string; id?: string; value: string };

const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function mutationError(reason: unknown, sr: boolean) {
  const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : reason instanceof Error ? reason.message : "";
  if (code === "duplicate_name") return sr ? "To ime već postoji ovde." : "That name already exists here.";
  if (code === "revision_conflict") return sr ? "Pronađeni su noviji podaci. Proveri listu i pokušaj ponovo." : "Newer data was found. Review the list and try again.";
  if (code === "offline_read_only") return sr ? "Poveži se na internet da bi menjao oblasti i skillove." : "Reconnect before changing areas and skills.";
  return sr ? "Promena nije sačuvana." : "The change was not saved.";
}

export default function ProgressScreen() {
  const { state, offline, saving, runGrowthCommand } = useCloudState();
  const { language } = usePreferences();
  const sr = language === "sr";
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState("");

  if (!state) return <Screen><PageHeader eyebrow={sr ? "TVOJ PUT" : "YOUR PATH"} title={sr ? "Napredak" : "Progress"} /><CloudStateMessage /></Screen>;

  const attributes = state.attributes.filter(attribute => !attribute.deletedAt);
  const locked = offline || saving;
  const mutate = async (command: GrowthCommand, after?: () => void) => {
    setError("");
    try {
      await runGrowthCommand(command);
      after?.();
    } catch (reason) {
      setError(mutationError(reason, sr));
    }
  };

  const submitEditor = () => {
    if (!editor || locked || !editor.value.trim()) return;
    const name = editor.value.trim();
    let command: GrowthCommand;
    if (editor.kind === "attribute") {
      command = editor.mode === "create"
        ? { action: "attribute_create", id: makeId("area"), name, color: AREA_COLORS[attributes.length % AREA_COLORS.length] }
        : { action: "attribute_rename", attributeId: editor.id ?? "", name };
    } else {
      command = editor.mode === "create"
        ? { action: "skill_create", id: makeId("skill"), attributeId: editor.attributeId, name }
        : { action: "skill_rename", skillId: editor.id ?? "", name };
    }
    void mutate(command, () => setEditor(null));
  };

  const deleteAttribute = (attributeId: string) => {
    const attribute = state.attributes.find(item => item.id === attributeId);
    if (!attribute) return;
    const relatedSkills = state.skills.filter(skill => skill.attributeId === attributeId);
    const hasHistory = state.quests.some(quest => quest.attributeId === attributeId) ||
      state.transactions.some(transaction => transaction.attributeId === attributeId) ||
      relatedSkills.some(skill => Boolean(skill.deletedAt));
    Alert.alert(
      sr ? `Obrisati oblast „${attribute.name}“?` : `Delete “${attribute.name}”?`,
      hasHistory
        ? (sr ? "Sklanja se iz aktivnog prikaza, ali imena i XP istorija ostaju. Aktivni questovi oblasti biće arhivirani." : "It will be hidden, but names and XP history stay. Active quests in this area will be archived.")
        : (sr ? "Nema istoriju i biće potpuno obrisana sa praznim skillovima." : "It has no history and will be removed completely with unused skills."),
      [{ text: sr ? "Odustani" : "Cancel", style: "cancel" }, { text: sr ? "Obriši" : "Delete", style: "destructive", onPress: () => void mutate({ action: "attribute_delete", attributeId }) }],
    );
  };

  const deleteSkill = (skillId: string) => {
    const skill = state.skills.find(item => item.id === skillId);
    if (!skill) return;
    const hasHistory = state.quests.some(quest => quest.skillId === skillId) || state.transactions.some(transaction => transaction.skillId === skillId);
    Alert.alert(
      sr ? `Obrisati skill „${skill.name}“?` : `Delete “${skill.name}”?`,
      hasHistory
        ? (sr ? "Sklanja se iz aktivnog prikaza, ali ime i XP istorija ostaju. Aktivni questovi skilla biće arhivirani." : "It will be hidden, but its name and XP history stay. Its active quests will be archived.")
        : (sr ? "Nema questove ni XP istoriju i biće potpuno obrisan." : "It has no quests or XP history and will be removed completely."),
      [{ text: sr ? "Odustani" : "Cancel", style: "cancel" }, { text: sr ? "Obriši" : "Delete", style: "destructive", onPress: () => void mutate({ action: "skill_delete", skillId }) }],
    );
  };

  return (
    <Screen>
      <PageHeader
        eyebrow={sr ? "TVOJ PUT" : "YOUR PATH"}
        title={sr ? "Oblasti napretka" : "Growth areas"}
        description={sr ? "Napravi oblast, dodaj joj skillove, pa poveži konkretne questove." : "Create an area, add skills inside it, then connect concrete quests."}
      />
      <View style={styles.pathHint}><Text style={styles.pathStep}>{sr ? "OBLAST" : "AREA"}</Text><Ionicons color={colors.textMuted} name="chevron-forward" size={15} /><Text style={styles.pathStep}>SKILL</Text><Ionicons color={colors.textMuted} name="chevron-forward" size={15} /><Text style={[styles.pathStep, styles.pathQuest]}>QUEST</Text></View>
      <Pressable disabled={locked} onPress={() => setEditor({ kind: "attribute", mode: "create", value: "" })} style={({ pressed }) => [styles.addArea, locked && styles.disabled, pressed && styles.pressed]}>
        <Ionicons color={colors.text} name="add-circle-outline" size={21} /><Text style={styles.addAreaText}>{sr ? "Dodaj oblast napretka" : "Add growth area"}</Text>
      </Pressable>
      {saving ? <View style={styles.messageRow}><ActivityIndicator color={colors.violetSoft} /><Text style={styles.muted}>{sr ? "Čuvam potvrđenu promenu…" : "Saving confirmed change…"}</Text></View> : null}
      {offline ? <Text style={styles.readOnly}>{sr ? "Offline režim je samo za pregled." : "Offline mode is view-only."}</Text> : null}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

      {attributes.length ? attributes.map(attribute => {
        const skills = state.skills.filter(skill => skill.attributeId === attribute.id && !skill.deletedAt);
        const areaXp = activeXp(state.transactions.filter(transaction => transaction.attributeId === attribute.id));
        return (
          <View key={attribute.id} style={styles.areaCard}>
            <View style={styles.areaHeading}>
              <View style={[styles.areaMark, { backgroundColor: attribute.color || colors.violet }]} />
              <View style={styles.areaCopy}><Text style={styles.kicker}>{sr ? "OBLAST" : "AREA"}</Text><Text style={styles.areaName}>{attribute.name}</Text><Text style={styles.muted}>{skills.length} {sr ? "skillova" : "skills"}</Text></View>
              <View style={styles.areaSide}>
                <Text style={styles.areaXp}>{areaXp} XP</Text>
                <View style={styles.iconRow}>
                  <IconAction disabled={locked} icon="pencil-outline" label={sr ? "Preimenuj oblast" : "Rename area"} onPress={() => setEditor({ kind: "attribute", mode: "rename", id: attribute.id, value: attribute.name })} />
                  <IconAction danger disabled={locked} icon="trash-outline" label={sr ? "Obriši oblast" : "Delete area"} onPress={() => deleteAttribute(attribute.id)} />
                </View>
              </View>
            </View>
            <View style={styles.skillList}>
              {skills.length ? skills.map(skill => {
                const xp = activeXp(state.transactions.filter(transaction => transaction.skillId === skill.id));
                const completed = state.quests.filter(quest => quest.skillId === skill.id && quest.status === "completed").length;
                return (
                  <View key={skill.id} style={styles.skillRow}>
                    <View style={styles.skillIcon}><Ionicons color={colors.violetSoft} name="school-outline" size={18} /></View>
                    <View style={styles.skillCopy}><Text style={styles.skillName}>{skill.name}</Text><Text style={styles.skillMeta}>{completed} {sr ? "završenih questova" : "completed quests"} · {xp} XP</Text></View>
                    <IconAction disabled={locked} icon="pencil-outline" label={sr ? "Preimenuj skill" : "Rename skill"} onPress={() => setEditor({ kind: "skill", mode: "rename", attributeId: attribute.id, id: skill.id, value: skill.name })} />
                    <IconAction danger disabled={locked} icon="trash-outline" label={sr ? "Obriši skill" : "Delete skill"} onPress={() => deleteSkill(skill.id)} />
                  </View>
                );
              }) : <Text style={styles.emptySkill}>{sr ? "Još nema skillova u ovoj oblasti." : "No skills in this area yet."}</Text>}
              <Pressable disabled={locked} onPress={() => setEditor({ kind: "skill", mode: "create", attributeId: attribute.id, value: "" })} style={({ pressed }) => [styles.addSkill, locked && styles.disabled, pressed && styles.pressed]}>
                <Ionicons color={colors.violetSoft} name="add" size={18} /><Text style={styles.addSkillText}>{sr ? `Dodaj skill u ${attribute.name}` : `Add skill to ${attribute.name}`}</Text>
              </Pressable>
            </View>
          </View>
        );
      }) : (
        <View style={styles.emptyState}><Ionicons color={colors.violetSoft} name="planet-outline" size={34} /><Text style={styles.emptyTitle}>{sr ? "Počni od jedne oblasti" : "Start with one growth area"}</Text><Text style={styles.emptyBody}>{sr ? "Primer: Languages → Spanish → prvi konkretan quest." : "Example: Languages → Spanish → your first concrete quest."}</Text></View>
      )}

      <Modal animationType="fade" onRequestClose={() => !saving && setEditor(null)} transparent visible={editor !== null}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalTitleRow}><View><Text style={styles.kicker}>{editor?.kind === "skill" ? "SKILL" : (sr ? "OBLAST" : "GROWTH AREA")}</Text><Text style={styles.modalTitle}>{editor?.mode === "rename" ? (sr ? "Promeni naziv" : "Rename") : (sr ? "Napravi novo" : "Create new")}</Text></View><Pressable disabled={saving} onPress={() => setEditor(null)} style={styles.closeButton}><Ionicons color={colors.textMuted} name="close" size={24} /></Pressable></View>
            <TextInput autoFocus maxLength={80} onChangeText={value => setEditor(current => current ? { ...current, value } : current)} placeholder={editor?.kind === "skill" ? (sr ? "Npr. Spanish" : "E.g. Spanish") : (sr ? "Npr. Languages" : "E.g. Languages")} placeholderTextColor={colors.textMuted} selectTextOnFocus={editor?.mode === "rename"} spellCheck={state.settings.spellcheck !== false} style={styles.input} value={editor?.value ?? ""} />
            <Text style={styles.counter}>{editor?.value.length ?? 0} / 80</Text>
            <View style={styles.modalActions}><Pressable disabled={saving} onPress={() => setEditor(null)} style={styles.modalButton}><Text style={styles.buttonText}>{sr ? "Odustani" : "Cancel"}</Text></Pressable><Pressable disabled={saving || !editor?.value.trim()} onPress={submitEditor} style={[styles.modalButton, styles.modalSave, (saving || !editor?.value.trim()) && styles.disabled]}>{saving ? <ActivityIndicator color={colors.text} /> : <Text style={styles.buttonText}>{editor?.mode === "rename" ? (sr ? "Sačuvaj" : "Save") : (sr ? "Napravi" : "Create")}</Text>}</Pressable></View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function IconAction({ danger = false, disabled, icon, label, onPress }: { danger?: boolean; disabled: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" disabled={disabled} hitSlop={6} onPress={onPress} style={({ pressed }) => [styles.iconButton, danger && styles.iconDanger, disabled && styles.disabled, pressed && styles.pressed]}><Ionicons color={danger ? colors.danger : colors.textMuted} name={icon} size={17} /></Pressable>;
}

const styles = StyleSheet.create({
  pathHint: { marginBottom: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  pathStep: { color: colors.violetSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  pathQuest: { color: colors.cyan },
  addArea: { minHeight: 52, marginBottom: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1, borderColor: "#7560d1", borderRadius: radius.md, backgroundColor: colors.violet },
  addAreaText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  messageRow: { marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  muted: { color: colors.textMuted, fontSize: 12 },
  readOnly: { marginBottom: spacing.sm, color: colors.gold, fontSize: 12, textAlign: "center" },
  error: { marginBottom: spacing.sm, color: colors.danger, fontSize: 13, textAlign: "center" },
  areaCard: { marginBottom: spacing.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  areaHeading: { minHeight: 86, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  areaMark: { width: 5, height: 48, borderRadius: 3 },
  areaCopy: { flex: 1, gap: 3 },
  kicker: { color: colors.violetSoft, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  areaName: { color: colors.text, fontSize: 19, fontWeight: "700" },
  areaSide: { alignItems: "flex-end", gap: spacing.xs },
  areaXp: { color: colors.cyan, fontSize: 14, fontWeight: "800" },
  iconRow: { flexDirection: "row", gap: spacing.xs },
  iconButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  iconDanger: { borderColor: "#5c2939", backgroundColor: "#1c1018" },
  skillList: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  skillRow: { minHeight: 62, padding: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  skillIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "#201b42" },
  skillCopy: { flex: 1, gap: 3 },
  skillName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  skillMeta: { color: colors.textMuted, fontSize: 11 },
  emptySkill: { padding: spacing.sm, color: colors.textMuted, fontSize: 13 },
  addSkill: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, borderStyle: "dashed" },
  addSkillText: { color: colors.violetSoft, fontSize: 12, fontWeight: "700" },
  emptyState: { alignItems: "center", gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: "700", textAlign: "center" },
  emptyBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: spacing.md, backgroundColor: "rgba(3, 4, 11, 0.82)" },
  modalCard: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surfaceRaised },
  modalTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  closeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  input: { minHeight: 52, marginTop: spacing.md, paddingHorizontal: spacing.md, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background },
  counter: { marginTop: spacing.xs, color: colors.textMuted, fontSize: 11, textAlign: "right" },
  modalActions: { marginTop: spacing.md, flexDirection: "row", gap: spacing.sm },
  modalButton: { minHeight: 48, flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  modalSave: { borderColor: "#7560d1", backgroundColor: colors.violet },
  buttonText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
