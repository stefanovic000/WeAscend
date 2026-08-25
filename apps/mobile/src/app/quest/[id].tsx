import { Ionicons } from "@expo/vector-icons";
import { questTemplateFromQuest, type BossAttempt, type QuestCommand } from "@weascend/shared";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { CloudStateMessage } from "@/components/CloudStateMessage";
import { Screen } from "@/components/Screen";
import { useCloudState } from "@/providers/CloudStateProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, radius, spacing } from "@/theme";

type ActionTone = "primary" | "neutral" | "danger";

function commandError(reason: unknown, sr: boolean) {
  const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : reason instanceof Error ? reason.message : "";
  if (code === "revision_conflict") return sr ? "Pronađeni su noviji podaci. Proveri quest i pokušaj ponovo." : "Newer data was found. Review the quest and try again.";
  if (code === "offline_read_only") return sr ? "Poveži se na internet da bi menjao quest." : "Reconnect before changing this quest.";
  if (code === "invalid_status") return sr ? "Ta radnja više nije dostupna za trenutni status." : "That action is no longer available for the current status.";
  if (code === "invalid_attempt") return sr ? "Upiši kratak, konkretan rezultat pokušaja." : "Enter a short, concrete result for this attempt.";
  if (code === "boss_already_cleared") return sr ? "Ovaj Boss je već završen." : "This Boss has already been cleared.";
  return sr ? "Promena nije sačuvana. Potvrđeni podaci nisu izmenjeni." : "The change was not saved. Confirmed data stayed unchanged.";
}

function ActionButton({
  disabled,
  icon,
  label,
  onPress,
  tone = "neutral",
}: {
  disabled: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: ActionTone;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        tone === "primary" && styles.actionPrimary,
        tone === "danger" && styles.actionDanger,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons color={tone === "danger" ? colors.danger : colors.text} name={icon} size={20} />
      <Text style={[styles.actionLabel, tone === "danger" && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

function formatMoment(value: string, language: "en" | "sr") {
  if (!value) return language === "sr" ? "Nije postavljeno" : "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "sr" ? "sr-RS" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function QuestDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { state, offline, saving, runQuestCommand, saveState } = useCloudState();
  const { language } = usePreferences();
  const sr = language === "sr";
  const [error, setError] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [bossOutcome, setBossOutcome] = useState<"failed" | "cleared" | null>(null);
  const [bossResult, setBossResult] = useState("");

  const quest = state?.quests.find(item => item.id === id);
  const attribute = state?.attributes.find(item => item.id === quest?.attributeId);
  const skill = state?.skills.find(item => item.id === quest?.skillId);
  const hasXp = useMemo(
    () => Boolean(state && quest && state.transactions.some(transaction => transaction.questId === quest.id && !transaction.reversedAt)),
    [quest, state],
  );
  const bossAttempts = useMemo(
    () => (state?.bossAttempts ?? [])
      .filter((attempt): attempt is BossAttempt => Boolean(
        attempt && attempt.bossQuestId === id && !attempt.reversedAt,
      ))
      .sort((left, right) => right.attemptNumber - left.attemptNumber),
    [id, state?.bossAttempts],
  );
  const linkedTemplate = state?.questTemplates?.find(item => item.id === quest?.templateId || item.sourceQuestId === quest?.id);

  if (!state) return <Screen><CloudStateMessage /></Screen>;
  if (!quest) {
    return (
      <Screen>
        <View style={styles.missingCard}>
          <Ionicons color={colors.textMuted} name="document-outline" size={32} />
          <Text style={styles.title}>{sr ? "Quest nije pronađen" : "Quest not found"}</Text>
          <Text style={styles.body}>{sr ? "Možda je obrisan na drugom uređaju." : "It may have been deleted on another device."}</Text>
          <ActionButton disabled={false} icon="arrow-back" label={sr ? "Nazad" : "Back"} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const locked = offline || saving;
  const mutate = async (command: QuestCommand, after?: () => void) => {
    setError("");
    try {
      await runQuestCommand(command);
      after?.();
    } catch (reason) {
      setError(commandError(reason, sr));
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      sr ? "Obrisati quest?" : "Delete quest?",
      sr
        ? "Naziv, opis i beleška biće trajno obrisani iz baze. Već zarađen XP ostaje u istoriji bez sadržaja questa."
        : "Its title, description, and note will be permanently removed from the database. Earned XP remains as content-free history.",
      [
        { text: sr ? "Odustani" : "Cancel", style: "cancel" },
        {
          text: sr ? "Obriši" : "Delete",
          style: "destructive",
          onPress: () => void mutate({ action: "delete", questId: quest.id }, () => router.back()),
        },
      ],
    );
  };

  const openNote = () => {
    setNoteDraft(quest.note ?? "");
    setNoteOpen(true);
  };

  const saveNote = () => void mutate(
    { action: "note", questId: quest.id, note: noteDraft },
    () => setNoteOpen(false),
  );

  const openBossResult = (outcome: "failed" | "cleared") => {
    setBossResult("");
    setBossOutcome(outcome);
  };

  const saveBossResult = () => {
    if (!bossOutcome || !bossResult.trim()) return;
    void mutate(
      { action: "boss_attempt", bossQuestId: quest.id, outcome: bossOutcome, result: bossResult.trim() },
      () => {
        setBossOutcome(null);
        setBossResult("");
      },
    );
  };

  const confirmUndoBoss = () => {
    Alert.alert(
      sr ? "Poništiti Boss Clear?" : "Undo Boss Clear?",
      sr
        ? "Boss će ponovo postati aktivan, a samo njegov Clear XP biće poništen. XP pripremnih questova ostaje."
        : "The Boss will become active again and only its Clear XP will be reversed. Preparation XP stays earned.",
      [
        { text: sr ? "Odustani" : "Cancel", style: "cancel" },
        { text: sr ? "Poništi Clear" : "Undo Clear", style: "destructive", onPress: () => void mutate({ action: "undo_boss_clear", bossQuestId: quest.id }) },
      ],
    );
  };

  const saveAsTemplate = async () => {
    if (offline || saving || quest.type === "Boss" || quest.parentQuestId || linkedTemplate) return;
    const template = questTemplateFromQuest(quest);
    if (!template) return;
    setError("");
    try {
      await saveState({ ...state, questTemplates: [template, ...(state.questTemplates ?? [])] });
      Alert.alert(sr ? "Template je sačuvan" : "Template saved", sr ? "Sada možeš da ga koristiš ručno ili mu dodaš raspored." : "You can now use it manually or add a schedule.");
    } catch (reason) {
      setError(commandError(reason, sr));
    }
  };

  return (
    <Screen keyboardAware>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.eyebrow}>{quest.type.toUpperCase()} QUEST</Text>
          <View style={[styles.statusPill, quest.status === "failed" && styles.statusFailed, quest.status === "completed" && styles.statusComplete]}>
            <Text style={[styles.statusText, quest.status === "failed" && styles.dangerText]}>{quest.status.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.title}>{quest.title}</Text>
        <Text style={styles.path}>{attribute?.name ?? (sr ? "Obrisana oblast" : "Deleted area")}  ›  {skill?.name ?? (sr ? "Obrisan skill" : "Deleted skill")}</Text>
        <View style={styles.rewardRow}>
          <Text style={styles.reward}>{quest.xp} XP</Text>
          <Text style={styles.date}>{formatMoment(quest.date, language)}</Text>
        </View>
      </View>

      {quest.description ? <Detail label={sr ? "OPIS" : "DESCRIPTION"} value={quest.description} /> : null}
      {quest.completionConditions ? <Detail label={sr ? "ZAVRŠENO ZNAČI" : "DONE MEANS"} value={quest.completionConditions} /> : null}
      {quest.deadline ? <Detail label={sr ? "ROK ZA ZAVRŠETAK" : "COMPLETION WINDOW"} value={formatMoment(quest.deadline, language)} /> : null}
      {quest.failureConsequence ? <Detail label={sr ? "POSLEDICA" : "CONSEQUENCE"} value={quest.failureConsequence} /> : null}
      {quest.note ? <Detail label={sr ? "BELEŠKA" : "NOTE"} value={quest.note} accent /> : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{sr ? "Radnje" : "Actions"}</Text>
        {saving ? <ActivityIndicator color={colors.violetSoft} /> : null}
      </View>

      {quest.type === "Boss" && quest.status !== "archived" ? (
        <View style={styles.bossNotice}>
          <Ionicons color={colors.gold} name="shield-outline" size={21} />
          <Text style={styles.bossText}>{sr ? "Boss XP se dobija samo kada zabeležiš konkretan Clear rezultat. Neuspešan pokušaj čuva lekciju, ali ne daje Boss XP." : "Boss XP is awarded only when you record a concrete Clear result. A failed attempt preserves the lesson but awards no Boss XP."}</Text>
        </View>
      ) : null}

      {quest.type === "Boss" && bossAttempts.length ? (
        <View style={styles.attemptSection}>
          <Text style={styles.detailLabel}>{sr ? "ISTORIJA POKUŠAJA" : "ATTEMPT HISTORY"}</Text>
          {bossAttempts.map(attempt => (
            <View key={attempt.id} style={styles.attemptCard}>
              <View style={styles.attemptTop}>
                <Text style={[styles.attemptOutcome, attempt.outcome === "failed" ? styles.dangerText : styles.clearText]}>
                  {attempt.outcome === "failed" ? (sr ? "NEUSPEŠAN POKUŠAJ" : "FAILED ATTEMPT") : "BOSS CLEAR"}
                </Text>
                <Text style={styles.attemptNumber}>#{attempt.attemptNumber}</Text>
              </View>
              <Text style={styles.attemptResult}>{attempt.result}</Text>
              <Text style={styles.attemptDate}>{formatMoment(attempt.createdAt, language)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {quest.type === "Boss" && quest.status === "active" ? (
          <>
            <ActionButton disabled={locked} icon="trophy-outline" label={sr ? "Potvrdi Boss Clear" : "Confirm Boss Clear"} onPress={() => openBossResult("cleared")} tone="primary" />
            <ActionButton disabled={locked} icon="shield-half-outline" label={sr ? "Zabeleži neuspešan pokušaj" : "Record failed attempt"} onPress={() => openBossResult("failed")} tone="danger" />
            {!hasXp ? <ActionButton disabled={locked} icon="create-outline" label={sr ? "Izmeni Boss" : "Edit Boss"} onPress={() => router.push({ pathname: "/quest/new", params: { editId: quest.id } } as Href)} /> : null}
          </>
        ) : null}
        {quest.type === "Boss" && quest.status === "completed" ? (
          <ActionButton disabled={locked} icon="arrow-undo-outline" label={sr ? "Poništi Boss Clear i XP" : "Undo Boss Clear and XP"} onPress={confirmUndoBoss} />
        ) : null}
        {quest.type !== "Boss" && quest.status === "active" ? (
          <>
            <ActionButton disabled={locked} icon="checkmark-circle-outline" label={sr ? "Završi quest" : "Complete quest"} onPress={() => void mutate({ action: "complete", questId: quest.id })} tone="primary" />
            <ActionButton disabled={locked} icon="close-circle-outline" label={sr ? "Označi kao neuspešan" : "Mark as failed"} onPress={() => void mutate({ action: "fail", questId: quest.id })} tone="danger" />
            {!hasXp ? <ActionButton disabled={locked} icon="create-outline" label={sr ? "Izmeni quest" : "Edit quest"} onPress={() => router.push({ pathname: "/quest/new", params: { editId: quest.id } } as Href)} /> : null}
          </>
        ) : null}
        {quest.type !== "Boss" && (quest.status === "failed" || quest.status === "skipped") ? (
          <ActionButton disabled={locked} icon="refresh" label={sr ? "Pokušaj ponovo" : "Retry quest"} onPress={() => void mutate({ action: "retry", questId: quest.id })} tone="primary" />
        ) : null}
        {quest.type !== "Boss" && quest.status === "completed" ? (
          <ActionButton disabled={locked} icon="arrow-undo-outline" label={hasXp ? (sr ? "Poništi završetak i XP" : "Undo completion and XP") : (sr ? "Ponovo otvori quest" : "Reopen quest")} onPress={() => void mutate({ action: "undo_completion", questId: quest.id })} />
        ) : null}
        {quest.status === "archived" ? (
          <ActionButton disabled={locked} icon="archive-outline" label={sr ? "Vrati iz arhive" : "Restore from archive"} onPress={() => void mutate({ action: "restore", questId: quest.id })} tone="primary" />
        ) : (
          <>
            {quest.type !== "Boss" && !quest.parentQuestId ? (linkedTemplate
              ? <ActionButton disabled={false} icon="options-outline" label={sr ? "Uredi povezani template" : "Manage linked template"} onPress={() => router.push(`/template/${encodeURIComponent(linkedTemplate.id)}` as Href)} />
              : <ActionButton disabled={locked} icon="copy-outline" label={sr ? "Sačuvaj kao template" : "Save as template"} onPress={() => void saveAsTemplate()} />
            ) : null}
            <ActionButton disabled={locked} icon="document-text-outline" label={quest.note ? (sr ? "Izmeni belešku" : "Edit note") : (sr ? "Dodaj belešku" : "Add note")} onPress={openNote} />
            <ActionButton disabled={locked} icon="archive-outline" label={sr ? "Arhiviraj" : "Archive"} onPress={() => void mutate({ action: "archive", questId: quest.id })} />
          </>
        )}
        <ActionButton disabled={locked} icon="trash-outline" label={sr ? "Trajno obriši" : "Delete permanently"} onPress={confirmDelete} tone="danger" />
      </View>

      {offline ? <Text style={styles.readOnly}>{sr ? "Offline režim je samo za pregled." : "Offline mode is view-only."}</Text> : null}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

      <Modal animationType="fade" onRequestClose={() => setNoteOpen(false)} transparent visible={noteOpen}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>{sr ? "Kratka beleška" : "Quick note"}</Text>
              <Pressable accessibilityLabel={sr ? "Zatvori" : "Close"} onPress={() => setNoteOpen(false)} style={styles.closeButton}>
                <Ionicons color={colors.textMuted} name="close" size={24} />
              </Pressable>
            </View>
            <TextInput
              autoFocus
              maxLength={500}
              multiline
              onChangeText={setNoteDraft}
              placeholder={sr ? "Zapiši nešto korisno za ovaj quest…" : "Write something useful for this quest…"}
              placeholderTextColor={colors.textMuted}
              spellCheck={state.settings.spellcheck !== false}
              style={styles.noteInput}
              value={noteDraft}
            />
            <Text style={styles.counter}>{noteDraft.length} / 500</Text>
            <View style={styles.modalActions}>
              <Pressable disabled={saving} onPress={() => setNoteOpen(false)} style={styles.modalButton}><Text style={styles.modalButtonText}>{sr ? "Odustani" : "Cancel"}</Text></Pressable>
              <Pressable disabled={saving} onPress={saveNote} style={[styles.modalButton, styles.modalSave, saving && styles.disabled]}>
                {saving ? <ActivityIndicator color={colors.text} /> : <Text style={styles.modalButtonText}>{sr ? "Sačuvaj" : "Save"}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => !saving && setBossOutcome(null)} transparent visible={bossOutcome !== null}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalTitleRow}>
              <View style={styles.modalHeading}>
                <Text style={styles.modalEyebrow}>{bossOutcome === "cleared" ? "BOSS CLEAR" : (sr ? "POKUŠAJ" : "ATTEMPT")}</Text>
                <Text style={styles.modalTitle}>{bossOutcome === "cleared" ? (sr ? "Zabeleži rezultat" : "Record the result") : (sr ? "Šta se dogodilo?" : "What happened?")}</Text>
              </View>
              <Pressable accessibilityLabel={sr ? "Zatvori" : "Close"} disabled={saving} onPress={() => setBossOutcome(null)} style={styles.closeButton}>
                <Ionicons color={colors.textMuted} name="close" size={24} />
              </Pressable>
            </View>
            <Text style={styles.modalHelp}>
              {bossOutcome === "cleared"
                ? (sr ? "Upiši merljiv rezultat koji potvrđuje da je Boss savladan." : "Enter the measurable result that confirms this Boss was cleared.")
                : (sr ? "Zapiši šta nije uspelo i šta želiš da popraviš pri sledećem pokušaju." : "Record what failed and what you want to improve on the next attempt.")}
            </Text>
            <TextInput
              autoFocus
              maxLength={1000}
              multiline
              onChangeText={setBossResult}
              placeholder={bossOutcome === "cleared" ? (sr ? "Npr. položen ispit sa ocenom 8…" : "E.g. passed the exam with a score of 82%…") : (sr ? "Npr. zadatak 3 nije završen; ponoviti tu oblast…" : "E.g. question 3 was incomplete; review that topic…")}
              placeholderTextColor={colors.textMuted}
              spellCheck={state.settings.spellcheck !== false}
              style={styles.noteInput}
              value={bossResult}
            />
            <Text style={styles.counter}>{bossResult.length} / 1000</Text>
            <View style={styles.modalActions}>
              <Pressable disabled={saving} onPress={() => setBossOutcome(null)} style={styles.modalButton}><Text style={styles.modalButtonText}>{sr ? "Odustani" : "Cancel"}</Text></Pressable>
              <Pressable disabled={saving || !bossResult.trim()} onPress={saveBossResult} style={[styles.modalButton, bossOutcome === "failed" ? styles.modalFail : styles.modalSave, (saving || !bossResult.trim()) && styles.disabled]}>
                {saving ? <ActivityIndicator color={colors.text} /> : <Text style={[styles.modalButtonText, bossOutcome === "failed" && styles.dangerText]}>{bossOutcome === "cleared" ? (sr ? "Potvrdi Clear" : "Confirm Clear") : (sr ? "Sačuvaj pokušaj" : "Save attempt")}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function Detail({ accent = false, label, value }: { accent?: boolean; label: string; value: string }) {
  return (
    <View style={[styles.detail, accent && styles.detailAccent]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  eyebrow: { flex: 1, color: colors.violetSoft, fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  statusFailed: { borderColor: "#713147", backgroundColor: "#23101a" },
  statusComplete: { borderColor: "#28706c", backgroundColor: "#0d2526" },
  statusText: { color: colors.textMuted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  title: { color: colors.text, fontSize: 25, lineHeight: 31, fontWeight: "800" },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  path: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  rewardRow: { marginTop: spacing.xs, paddingTop: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  reward: { color: colors.cyan, fontSize: 18, fontWeight: "900" },
  date: { flex: 1, color: colors.textMuted, fontSize: 12, textAlign: "right" },
  detail: { gap: spacing.xs, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  detailAccent: { borderWidth: 1, borderColor: "#464071", backgroundColor: "#14142a" },
  detailLabel: { color: colors.violetSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  detailValue: { color: colors.text, fontSize: 14, lineHeight: 21 },
  sectionHeader: { marginTop: spacing.lg, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: "800" },
  bossNotice: { marginBottom: spacing.sm, padding: spacing.md, flexDirection: "row", gap: spacing.sm, borderWidth: 1, borderColor: "#66522d", borderRadius: radius.md, backgroundColor: "#181522" },
  bossText: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  attemptSection: { gap: spacing.sm, marginBottom: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  attemptCard: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  attemptTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  attemptOutcome: { flex: 1, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  attemptNumber: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
  attemptResult: { color: colors.text, fontSize: 13, lineHeight: 19 },
  attemptDate: { color: colors.textMuted, fontSize: 10 },
  clearText: { color: colors.cyan },
  actions: { gap: spacing.sm },
  action: { minHeight: 52, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  actionPrimary: { borderColor: "#7560d1", backgroundColor: colors.violet },
  actionDanger: { borderColor: "#713147", backgroundColor: "#21101a" },
  actionLabel: { color: colors.text, fontSize: 15, fontWeight: "700" },
  dangerText: { color: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  readOnly: { marginTop: spacing.sm, color: colors.gold, fontSize: 12, textAlign: "center" },
  error: { marginTop: spacing.sm, color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: "center" },
  missingCard: { gap: spacing.md, marginTop: spacing.xl, padding: spacing.lg, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: spacing.md, backgroundColor: "rgba(3, 4, 11, 0.82)" },
  modalCard: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surfaceRaised },
  modalTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalHeading: { flex: 1, gap: 3 },
  modalEyebrow: { color: colors.violetSoft, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  modalHelp: { marginTop: spacing.sm, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  closeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  noteInput: { minHeight: 150, marginTop: spacing.sm, padding: spacing.md, color: colors.text, fontSize: 15, lineHeight: 21, textAlignVertical: "top", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background },
  counter: { marginTop: spacing.xs, color: colors.textMuted, fontSize: 11, textAlign: "right" },
  modalActions: { marginTop: spacing.md, flexDirection: "row", gap: spacing.sm },
  modalButton: { minHeight: 48, flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  modalSave: { borderColor: "#7560d1", backgroundColor: colors.violet },
  modalFail: { borderColor: "#713147", backgroundColor: "#21101a" },
  modalButtonText: { color: colors.text, fontSize: 14, fontWeight: "800" },
});
