import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import type { Quest, QuestType, WeAscendState, XpCategory } from "@weascend/shared";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { apiJson } from "@/services/api";
import { getMobileAuth } from "@/services/firebase";
import { colors, radius, spacing } from "@/theme";

const MAX = { area: 80, skill: 80, title: 150, description: 3_000, completion: 500 } as const;
const QUEST_TYPES: QuestType[] = ["Side", "Main", "Mandatory", "Correction", "Daily", "Boss"];
const AREA_COLORS = ["#866bff", "#32d6c5", "#4ea5ff", "#ff6da8"];
type Step = 0 | 1 | 2 | 3 | 4 | 5;
type WindowChoice = "30" | "60" | "120" | "eod" | "none";
type XpSuggestion = {
  xp: number;
  category: XpCategory;
  confidence: "low" | "medium" | "high";
  rationale: string;
};

const copy = {
  en: {
    steps: ["Growth Area", "Skill", "Quest", "Schedule", "XP", "Confirm"],
    eyebrow: "GUIDED MISSION",
    title: "Create a focused quest",
    editTitle: "Edit this quest",
    pathHelp: "First define what this work improves. The hierarchy always stays visible.",
    chooseArea: "What part of your life does this improve?",
    chooseAreaHelp: "Choose a broad area such as Languages, University, Strength, or Career.",
    newArea: "Create a new growth area",
    areaName: "Growth area name",
    areaPlaceholder: "e.g. Languages",
    chooseSkill: "Which ability are you training?",
    chooseSkillHelp: "Only skills inside the selected growth area appear here.",
    newSkill: "Create a new skill",
    skillName: "Skill name",
    skillPlaceholder: "e.g. Spanish",
    questDetails: "What will you actually do?",
    questName: "Quest name",
    questPlaceholder: "A concrete action you can complete",
    description: "Description · optional",
    descriptionPlaceholder: "Add useful context, duration, or what the work includes.",
    completion: "What does done look like? · optional",
    completionPlaceholder: "e.g. Solve all five exercises without notes",
    questType: "Quest type",
    schedule: "When will you do it?",
    date: "Date",
    time: "Time",
    window: "Completion window",
    windows: { "30": "30 min", "60": "1 hour", "120": "2 hours", eod: "Until end of day", none: "No window" },
    scheduleHelp: "The window is informational. Missing it does not remove earned XP.",
    xpTitle: "Let the system estimate the reward",
    xpHelp: "The AI applies WeAscend's fixed XP rules. You can also create the quest with 0 XP.",
    estimate: "Estimate XP",
    estimating: "Estimating…",
    reestimate: "Change the quest to re-estimate",
    offlineAi: "AI system offline",
    offlineAiHelp: "The quest can still be created with 0 XP. Manual override remains a Settings choice.",
    zeroXp: "Continue with 0 XP",
    confidence: "confidence",
    confirmTitle: "Ready to activate",
    confirmHelp: "Review the path and reward. Nothing is saved until you confirm.",
    path: "Path",
    timing: "Timing",
    reward: "Reward",
    activate: "Activate quest",
    saveChanges: "Save changes",
    activating: "Activating…",
    back: "Back",
    continue: "Continue",
    duplicateArea: "That growth area already exists.",
    duplicateSkill: "That skill already exists in this growth area.",
    required: "Complete this step before continuing.",
    saveFailed: "The quest was not saved. Your confirmed cloud data stayed unchanged.",
    conflict: "Newer cloud data was found. Review this quest and try again.",
    readOnly: "Reconnect to create a quest",
  },
  sr: {
    steps: ["Oblast", "Skill", "Quest", "Termin", "XP", "Potvrda"],
    eyebrow: "VOĐENA MISIJA",
    title: "Napravi fokusiran quest",
    editTitle: "Izmeni ovaj quest",
    pathHelp: "Prvo odredi šta ovaj rad unapređuje. Hijerarhija uvek ostaje vidljiva.",
    chooseArea: "Koji deo života ovo unapređuje?",
    chooseAreaHelp: "Izaberi širu oblast kao Languages, University, Strength ili Career.",
    newArea: "Napravi novu oblast napretka",
    areaName: "Naziv oblasti",
    areaPlaceholder: "npr. Languages",
    chooseSkill: "Koju sposobnost treniraš?",
    chooseSkillHelp: "Ovde se prikazuju samo skillovi iz izabrane oblasti.",
    newSkill: "Napravi novi skill",
    skillName: "Naziv skilla",
    skillPlaceholder: "npr. Spanish",
    questDetails: "Šta ćeš konkretno uraditi?",
    questName: "Naziv questa",
    questPlaceholder: "Konkretna radnja koju možeš da završiš",
    description: "Opis · opciono",
    descriptionPlaceholder: "Dodaj koristan kontekst, trajanje ili šta rad obuhvata.",
    completion: "Kako izgleda završeno? · opciono",
    completionPlaceholder: "npr. Rešiti svih pet zadataka bez beleški",
    questType: "Vrsta questa",
    schedule: "Kada ćeš ga uraditi?",
    date: "Datum",
    time: "Vreme",
    window: "Rok za završetak",
    windows: { "30": "30 min", "60": "1 sat", "120": "2 sata", eod: "Do kraja dana", none: "Bez roka" },
    scheduleHelp: "Rok je informativan. Njegovo propuštanje ne oduzima već zarađen XP.",
    xpTitle: "Neka sistem proceni nagradu",
    xpHelp: "AI primenjuje fiksna WeAscend XP pravila. Quest možeš napraviti i sa 0 XP.",
    estimate: "Proceni XP",
    estimating: "Procenjujem…",
    reestimate: "Promeni quest za novu procenu",
    offlineAi: "AI sistem nije dostupan",
    offlineAiHelp: "Quest i dalje možeš napraviti sa 0 XP. Ručna izmena ostaje opcija u Settings.",
    zeroXp: "Nastavi sa 0 XP",
    confidence: "pouzdanost",
    confirmTitle: "Spremno za aktivaciju",
    confirmHelp: "Proveri put i nagradu. Ništa se ne čuva dok ne potvrdiš.",
    path: "Put",
    timing: "Termin",
    reward: "Nagrada",
    activate: "Aktiviraj quest",
    saveChanges: "Sačuvaj izmene",
    activating: "Aktiviram…",
    back: "Nazad",
    continue: "Nastavi",
    duplicateArea: "Ta oblast napretka već postoji.",
    duplicateSkill: "Taj skill već postoji u ovoj oblasti.",
    required: "Popuni ovaj korak pre nastavka.",
    saveFailed: "Quest nije sačuvan. Potvrđeni cloud podaci nisu promenjeni.",
    conflict: "Pronađeni su noviji cloud podaci. Proveri quest i pokušaj ponovo.",
    readOnly: "Poveži se da napraviš quest",
  },
} as const;

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function endOfWindow(start: Date, choice: WindowChoice) {
  if (choice === "none") return "";
  if (choice === "eod") {
    const end = new Date(start);
    end.setHours(23, 59, 0, 0);
    return end.toISOString();
  }
  return new Date(start.getTime() + Number(choice) * 60_000).toISOString();
}

function apiCode(reason: unknown) {
  return reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
}

export default function NewQuestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string | string[] }>();
  const editId = Array.isArray(params.editId) ? params.editId[0] : params.editId;
  const { state, offline, saveState, saving } = useCloudState();
  const { language } = usePreferences();
  const t = copy[language];
  const [step, setStep] = useState<Step>(0);
  const [selectedAttributeId, setSelectedAttributeId] = useState("");
  const [newAreaMode, setNewAreaMode] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [newSkillMode, setNewSkillMode] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [completionConditions, setCompletionConditions] = useState("");
  const [questType, setQuestType] = useState<QuestType>("Side");
  const [scheduledAt, setScheduledAt] = useState(() => new Date());
  const [windowChoice, setWindowChoice] = useState<WindowChoice>("60");
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [suggestion, setSuggestion] = useState<XpSuggestion | null>(null);
  const [suggestionFingerprint, setSuggestionFingerprint] = useState("");
  const [lastEstimateFingerprint, setLastEstimateFingerprint] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [aiOffline, setAiOffline] = useState(false);
  const [useZeroXp, setUseZeroXp] = useState(false);
  const [error, setError] = useState("");
  const hydratedEditId = useRef<string | null>(null);

  const attributes = useMemo(() => state?.attributes.filter(attribute => !attribute.deletedAt) ?? [], [state]);
  const selectedAttribute = attributes.find(attribute => attribute.id === selectedAttributeId);
  const skills = useMemo(
    () => state?.skills.filter(skill => !skill.deletedAt && skill.attributeId === selectedAttributeId) ?? [],
    [selectedAttributeId, state],
  );
  const selectedSkill = skills.find(skill => skill.id === selectedSkillId);
  const areaName = newAreaMode ? newAreaName.trim() : selectedAttribute?.name ?? "";
  const skillName = newSkillMode ? newSkillName.trim() : selectedSkill?.name ?? "";
  const fingerprint = JSON.stringify({
    title: title.trim(),
    description: description.trim(),
    completionConditions: completionConditions.trim(),
    questType,
    areaName,
    skillName,
    language,
  });
  const activeSuggestion = suggestion && suggestionFingerprint === fingerprint ? suggestion : null;

  useEffect(() => {
    if (!state || !editId || hydratedEditId.current === editId) return;
    const existing = state.quests.find(quest => quest.id === editId);
    if (!existing) return;
    hydratedEditId.current = editId;
    setSelectedAttributeId(existing.attributeId);
    setSelectedSkillId(existing.skillId);
    setTitle(existing.title);
    setDescription(existing.description);
    setCompletionConditions(existing.completionConditions);
    setQuestType(existing.type);
    const existingDate = new Date(existing.date);
    if (!Number.isNaN(existingDate.getTime())) setScheduledAt(existingDate);
    const deadline = new Date(existing.deadline);
    const duration = deadline.getTime() - existingDate.getTime();
    if (!existing.deadline || Number.isNaN(duration)) setWindowChoice("none");
    else if (duration === 30 * 60_000) setWindowChoice("30");
    else if (duration === 60 * 60_000) setWindowChoice("60");
    else if (duration === 120 * 60_000) setWindowChoice("120");
    else setWindowChoice("eod");
  }, [editId, state]);

  useEffect(() => {
    if (!state || !editId || hydratedEditId.current !== editId || !title.trim() || suggestion) return;
    const existing = state.quests.find(quest => quest.id === editId);
    if (!existing || existing.title !== title || existing.description !== description || existing.completionConditions !== completionConditions) return;
    const current: XpSuggestion = {
      xp: existing.xp,
      category: existing.xpCategory ?? (existing.type === "Boss" ? "boss" : "growth"),
      confidence: "high",
      rationale: language === "sr" ? "Trenutna potvrđena nagrada." : "Current confirmed reward.",
    };
    setSuggestion(current);
    setSuggestionFingerprint(fingerprint);
    setLastEstimateFingerprint("");
  }, [completionConditions, description, editId, fingerprint, language, state, suggestion, title]);

  if (!state) {
    return <Screen><CloudStateMessage /></Screen>;
  }

  const spellCheck = state.settings.spellcheck !== false;
  const areaDuplicate = newAreaMode && attributes.some(attribute => attribute.name.trim().toLocaleLowerCase() === newAreaName.trim().toLocaleLowerCase());
  const skillDuplicate = newSkillMode && skills.some(skill => skill.name.trim().toLocaleLowerCase() === newSkillName.trim().toLocaleLowerCase());
  const canContinue = step === 0
    ? newAreaMode ? newAreaName.trim().length > 0 && !areaDuplicate : Boolean(selectedAttribute)
    : step === 1
      ? newSkillMode ? newSkillName.trim().length > 0 && !skillDuplicate : Boolean(selectedSkill)
      : step === 2
        ? title.trim().length > 0
        : step === 3
          ? !Number.isNaN(scheduledAt.getTime())
          : step === 4
            ? Boolean(activeSuggestion || useZeroXp)
            : true;

  const next = () => {
    setError("");
    if (!canContinue) {
      setError(areaDuplicate ? t.duplicateArea : skillDuplicate ? t.duplicateSkill : t.required);
      return;
    }
    if (step < 5) setStep((step + 1) as Step);
  };

  const selectAttribute = (id: string) => {
    setSelectedAttributeId(id);
    setNewAreaMode(false);
    setNewAreaName("");
    setSelectedSkillId("");
    setNewSkillMode(false);
    setNewSkillName("");
    setError("");
  };

  const chooseNewArea = () => {
    setSelectedAttributeId("");
    setNewAreaMode(true);
    setSelectedSkillId("");
    setNewSkillMode(true);
    setError("");
  };

  const estimateXp = async () => {
    if (!title.trim() || estimating || fingerprint === lastEstimateFingerprint || offline) return;
    setEstimating(true);
    setAiOffline(false);
    setError("");
    setUseZeroXp(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22_000);
    try {
      const auth = await getMobileAuth();
      if (!auth.currentUser) throw new Error("authentication_required");
      const token = await auth.currentUser.getIdToken();
      const response = await apiJson<{ suggestion?: XpSuggestion }>("/api/xp-estimate", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          type: questType,
          difficulty: "Normal",
          attribute: areaName,
          skill: skillName,
          completionConditions: completionConditions.trim(),
          language,
          mode: "estimate",
        }),
      });
      if (!response.suggestion) throw new Error("ai_invalid_response");
      setSuggestion(response.suggestion);
      setSuggestionFingerprint(fingerprint);
      setLastEstimateFingerprint(fingerprint);
    } catch {
      setAiOffline(true);
      setLastEstimateFingerprint(fingerprint);
    } finally {
      clearTimeout(timeout);
      setEstimating(false);
    }
  };

  const updateSchedule = (_event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === "android") setPicker(null);
    if (!value) return;
    const nextDate = new Date(scheduledAt);
    if (picker === "date") nextDate.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
    if (picker === "time") nextDate.setHours(value.getHours(), value.getMinutes(), 0, 0);
    setScheduledAt(nextDate);
  };

  const activate = async () => {
    if (offline || saving || !canContinue) return;
    setError("");
    const stamp = new Date().toISOString();
    const attributeId = newAreaMode ? makeId("area") : selectedAttributeId;
    const skillId = newSkillMode ? makeId("skill") : selectedSkillId;
    const xp = activeSuggestion?.xp ?? 0;
    const existingQuest = editId ? state.quests.find(item => item.id === editId) : undefined;
    const quest: Quest = {
      ...existingQuest,
      id: existingQuest?.id ?? makeId("quest"),
      title: title.trim(),
      description: description.trim(),
      type: questType,
      attributeId,
      skillId,
      xp,
      ...(activeSuggestion ? {
        xpCategory: activeSuggestion.category,
        xpSource: existingQuest && activeSuggestion.rationale === (language === "sr" ? "Trenutna potvrđena nagrada." : "Current confirmed reward.")
          ? existingQuest.xpSource ?? "legacy" as const
          : "ai" as const,
      } : {}),
      date: scheduledAt.toISOString(),
      deadline: endOfWindow(scheduledAt, windowChoice),
      recurrence: "none",
      difficulty: "Normal",
      completionConditions: completionConditions.trim(),
      failureConsequence: existingQuest?.failureConsequence ?? "",
      status: existingQuest?.status ?? "active",
      createdAt: existingQuest?.createdAt ?? stamp,
      updatedAt: stamp,
    };

    const nextState: WeAscendState = {
      ...state,
      attributes: newAreaMode ? [...state.attributes, {
        id: attributeId,
        name: areaName,
        color: AREA_COLORS[state.attributes.length % AREA_COLORS.length],
        createdAt: stamp,
        updatedAt: stamp,
      }] : state.attributes,
      skills: newSkillMode ? [...state.skills, {
        id: skillId,
        attributeId,
        name: skillName,
        createdAt: stamp,
        updatedAt: stamp,
      }] : state.skills,
      quests: existingQuest ? state.quests.map(item => item.id === existingQuest.id ? quest : item) : [quest, ...state.quests],
    };

    try {
      await saveState(nextState);
      router.replace(existingQuest ? (`/quest/${encodeURIComponent(existingQuest.id)}` as Href) : "/");
    } catch (reason) {
      setError(apiCode(reason) === "revision_conflict" ? t.conflict : t.saveFailed);
    }
  };

  const dateLabel = scheduledAt.toLocaleDateString(language === "sr" ? "sr-RS" : "en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const timeLabel = scheduledAt.toLocaleTimeString(language === "sr" ? "sr-RS" : "en-US", { hour: "2-digit", minute: "2-digit" });
  const footer = (
    <View style={styles.footer}>
      {step > 0 ? <Pressable disabled={saving} onPress={() => { setError(""); setStep((step - 1) as Step); }} style={styles.backButton}><Text style={styles.backLabel}>{t.back}</Text></Pressable> : null}
      {step < 5 ? (
        <Pressable disabled={!canContinue} onPress={next} style={[styles.continueButton, !canContinue && styles.disabled]}>
          <Text style={styles.continueLabel}>{t.continue}</Text><Ionicons color={colors.text} name="arrow-forward" size={19} />
        </Pressable>
      ) : (
        <Pressable disabled={offline || saving} onPress={() => void activate()} style={[styles.continueButton, (offline || saving) && styles.disabled]}>
          {saving ? <ActivityIndicator color={colors.text} /> : <Ionicons color={colors.text} name="flash" size={19} />}
          <Text style={styles.continueLabel}>{saving ? t.activating : offline ? t.readOnly : editId ? t.saveChanges : t.activate}</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <Screen footer={footer} keyboardAware>
      <Text style={styles.eyebrow}>{t.eyebrow}</Text>
      <Text style={styles.title}>{editId ? t.editTitle : t.title}</Text>
      <Text style={styles.description}>{t.pathHelp}</Text>

      <View style={styles.pathRow}>
        {[0, 1, 2].map((pathStep, index) => (
          <View key={pathStep} style={styles.pathItem}>
            <View style={[styles.pathDot, step >= pathStep && styles.pathDotActive]}><Text style={styles.pathDotText}>{pathStep + 1}</Text></View>
            <Text style={[styles.pathLabel, step === pathStep && styles.pathLabelActive]}>{t.steps[pathStep]}</Text>
            {index < 2 ? <Text style={styles.pathArrow}>›</Text> : null}
          </View>
        ))}
      </View>
      <View style={styles.stepLine}>
        <Text style={styles.stepCount}>{step + 1} / 6</Text>
        <Text style={styles.stepName}>{t.steps[step]}</Text>
        <View style={styles.stepTrack}><View style={[styles.stepFill, { width: `${((step + 1) / 6) * 100}%` }]} /></View>
      </View>

      {step === 0 ? (
        <View style={styles.section}>
          <SectionTitle title={t.chooseArea} body={t.chooseAreaHelp} />
          <View style={styles.choiceList}>
            {attributes.map(attribute => (
              <ChoiceCard key={attribute.id} active={!newAreaMode && selectedAttributeId === attribute.id} label={attribute.name} onPress={() => selectAttribute(attribute.id)} />
            ))}
            <ChoiceCard active={newAreaMode} icon="add-circle-outline" label={t.newArea} onPress={chooseNewArea} />
          </View>
          {newAreaMode ? <TextField counter label={t.areaName} maxLength={MAX.area} onChangeText={setNewAreaName} placeholder={t.areaPlaceholder} spellCheck={spellCheck} value={newAreaName} /> : null}
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.section}>
          <SectionTitle title={t.chooseSkill} body={`${areaName} · ${t.chooseSkillHelp}`} />
          <View style={styles.choiceList}>
            {!newAreaMode ? skills.map(skill => (
              <ChoiceCard key={skill.id} active={!newSkillMode && selectedSkillId === skill.id} label={skill.name} onPress={() => {
                setSelectedSkillId(skill.id);
                setNewSkillMode(false);
                setNewSkillName("");
                setError("");
              }} />
            )) : null}
            <ChoiceCard active={newSkillMode} icon="add-circle-outline" label={t.newSkill} onPress={() => {
              setSelectedSkillId("");
              setNewSkillMode(true);
              setError("");
            }} />
          </View>
          {newSkillMode ? <TextField counter label={t.skillName} maxLength={MAX.skill} onChangeText={setNewSkillName} placeholder={t.skillPlaceholder} spellCheck={spellCheck} value={newSkillName} /> : null}
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.section}>
          <SectionTitle title={t.questDetails} body={`${areaName} › ${skillName}`} />
          <TextField autoFocus counter label={t.questName} maxLength={MAX.title} onChangeText={setTitle} placeholder={t.questPlaceholder} spellCheck={spellCheck} value={title} />
          <TextField counter label={t.description} maxLength={MAX.description} multiline onChangeText={setDescription} placeholder={t.descriptionPlaceholder} spellCheck={spellCheck} value={description} />
          <TextField counter label={t.completion} maxLength={MAX.completion} multiline onChangeText={setCompletionConditions} placeholder={t.completionPlaceholder} spellCheck={spellCheck} value={completionConditions} />
          <Text style={styles.fieldLabel}>{t.questType.toUpperCase()}</Text>
          <View style={styles.chips}>{QUEST_TYPES.map(type => <Chip key={type} active={questType === type} label={type} onPress={() => setQuestType(type)} />)}</View>
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.section}>
          <SectionTitle title={t.schedule} body={`${title} · ${areaName} › ${skillName}`} />
          <View style={styles.scheduleRow}>
            <Pressable onPress={() => setPicker("date")} style={styles.scheduleButton}>
              <Ionicons color={colors.violetSoft} name="calendar-outline" size={21} />
              <View style={styles.scheduleCopy}><Text style={styles.fieldLabel}>{t.date.toUpperCase()}</Text><Text style={styles.scheduleValue}>{dateLabel}</Text></View>
            </Pressable>
            <Pressable onPress={() => setPicker("time")} style={styles.scheduleButton}>
              <Ionicons color={colors.violetSoft} name="time-outline" size={21} />
              <View style={styles.scheduleCopy}><Text style={styles.fieldLabel}>{t.time.toUpperCase()}</Text><Text style={styles.scheduleValue}>{timeLabel}</Text></View>
            </Pressable>
          </View>
          {picker ? (
            <View style={styles.pickerWrap}>
              <DateTimePicker
                display="default"
                minimumDate={picker === "date" ? new Date(new Date().setHours(0, 0, 0, 0)) : undefined}
                mode={picker}
                onChange={updateSchedule}
                value={scheduledAt}
              />
              {Platform.OS === "ios" ? <Pressable onPress={() => setPicker(null)} style={styles.pickerDone}><Text style={styles.pickerDoneLabel}>Done</Text></Pressable> : null}
            </View>
          ) : null}
          <Text style={styles.fieldLabel}>{t.window.toUpperCase()}</Text>
          <View style={styles.chips}>{(["30", "60", "120", "eod", "none"] as WindowChoice[]).map(choice => <Chip key={choice} active={windowChoice === choice} label={t.windows[choice]} onPress={() => setWindowChoice(choice)} />)}</View>
          <Text style={styles.helper}>{t.scheduleHelp}</Text>
        </View>
      ) : null}

      {step === 4 ? (
        <View style={styles.section}>
          <SectionTitle title={t.xpTitle} body={t.xpHelp} />
          {activeSuggestion ? (
            <View style={styles.xpCard}>
              <Text style={styles.xpValue}>{activeSuggestion.xp} XP</Text>
              <Text style={styles.xpMeta}>{activeSuggestion.category.toUpperCase()} · {activeSuggestion.confidence.toUpperCase()} {t.confidence.toUpperCase()}</Text>
              <Text style={styles.xpRationale}>{activeSuggestion.rationale}</Text>
            </View>
          ) : aiOffline && lastEstimateFingerprint === fingerprint ? (
            <View style={styles.aiOfflineCard}>
              <Ionicons color={colors.gold} name="sparkles-outline" size={23} />
              <View style={styles.scheduleCopy}><Text style={styles.aiOfflineTitle}>{t.offlineAi}</Text><Text style={styles.helper}>{t.offlineAiHelp}</Text></View>
            </View>
          ) : null}
          <Pressable
            disabled={estimating || offline || fingerprint === lastEstimateFingerprint}
            onPress={() => void estimateXp()}
            style={[styles.estimateButton, (estimating || offline || fingerprint === lastEstimateFingerprint) && styles.disabled]}
          >
            {estimating ? <ActivityIndicator color={colors.text} /> : <Ionicons color={colors.text} name="sparkles" size={20} />}
            <Text style={styles.estimateLabel}>{estimating ? t.estimating : fingerprint === lastEstimateFingerprint ? t.reestimate : t.estimate}</Text>
          </Pressable>
          {!activeSuggestion ? (
            <Pressable onPress={() => { setUseZeroXp(true); setError(""); }} style={[styles.zeroButton, useZeroXp && styles.zeroButtonActive]}>
              <Text style={styles.zeroLabel}>{t.zeroXp}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {step === 5 ? (
        <View style={styles.section}>
          <SectionTitle title={t.confirmTitle} body={t.confirmHelp} />
          <View style={styles.summaryCard}>
            <SummaryRow label={t.path} value={`${areaName} › ${skillName}`} />
            <SummaryRow label={t.questName} value={title} />
            <SummaryRow label={t.questType} value={questType} />
            <SummaryRow label={t.timing} value={`${dateLabel} · ${timeLabel}`} />
            <SummaryRow label={t.window} value={t.windows[windowChoice]} />
            <SummaryRow accent label={t.reward} value={`${activeSuggestion?.xp ?? 0} XP`} />
          </View>
        </View>
      ) : null}

      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

    </Screen>
  );
}

function SectionTitle({ title, body }: { title: string; body: string }) {
  return <View style={styles.sectionTitleWrap}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionBody}>{body}</Text></View>;
}

function ChoiceCard({ active, icon = "ellipse-outline", label, onPress }: { active: boolean; icon?: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choiceCard, active && styles.choiceActive]}>
      <Ionicons color={active ? colors.cyan : colors.violetSoft} name={active ? "checkmark-circle" : icon} size={22} />
      <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text></Pressable>;
}

function TextField({ counter, label, multiline, ...props }: React.ComponentProps<typeof TextInput> & { counter?: boolean; label: string }) {
  const length = typeof props.value === "string" ? props.value.length : 0;
  return (
    <View style={styles.field}>
      <View style={styles.fieldTop}><Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>{counter && props.maxLength ? <Text style={styles.counter}>{length}/{props.maxLength}</Text> : null}</View>
      <TextInput {...props} multiline={multiline} placeholderTextColor={colors.textMuted} style={[styles.input, multiline && styles.textarea]} />
    </View>
  );
}

function SummaryRow({ accent, label, value }: { accent?: boolean; label: string; value: string }) {
  return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label.toUpperCase()}</Text><Text style={[styles.summaryValue, accent && styles.summaryAccent]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.violetSoft, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  title: { marginTop: spacing.xs, color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "700" },
  description: { marginTop: spacing.xs, color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  pathRow: { marginTop: spacing.lg, flexDirection: "row", alignItems: "center" },
  pathItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  pathDot: { width: 23, height: 23, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  pathDotActive: { borderColor: colors.violet, backgroundColor: "#201b42" },
  pathDotText: { color: colors.textMuted, fontSize: 10, fontWeight: "800" },
  pathLabel: { color: colors.textMuted, fontSize: 11 },
  pathLabelActive: { color: colors.cyan, fontWeight: "800" },
  pathArrow: { marginHorizontal: 5, color: colors.border, fontSize: 18 },
  stepLine: { marginTop: spacing.md, gap: 5 },
  stepCount: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  stepName: { color: colors.text, fontSize: 13, fontWeight: "800" },
  stepTrack: { height: 3, overflow: "hidden", borderRadius: 2, backgroundColor: colors.border },
  stepFill: { height: "100%", borderRadius: 2, backgroundColor: colors.violet },
  section: { marginTop: spacing.lg, gap: spacing.md },
  sectionTitleWrap: { gap: spacing.xs },
  sectionTitle: { color: colors.text, fontSize: 21, lineHeight: 27, fontWeight: "700" },
  sectionBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  choiceList: { gap: spacing.sm },
  choiceCard: { minHeight: 54, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  choiceActive: { borderColor: "#277b82", backgroundColor: "#0f2028" },
  choiceLabel: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" },
  choiceLabelActive: { color: "#dbffff" },
  field: { gap: spacing.xs },
  fieldTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fieldLabel: { color: colors.violetSoft, fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  counter: { color: colors.textMuted, fontSize: 9, opacity: 0.65 },
  input: { minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: 13, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  textarea: { minHeight: 112, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.surface },
  chipActive: { borderColor: colors.violet, backgroundColor: "#201b42" },
  chipLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  chipLabelActive: { color: colors.text },
  scheduleRow: { gap: spacing.sm },
  scheduleButton: { minHeight: 62, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  scheduleCopy: { flex: 1, gap: 4 },
  scheduleValue: { color: colors.text, fontSize: 15, fontWeight: "700" },
  pickerWrap: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface },
  pickerDone: { alignSelf: "flex-end", minHeight: 40, justifyContent: "center", paddingHorizontal: spacing.md },
  pickerDoneLabel: { color: colors.cyan, fontSize: 14, fontWeight: "800" },
  helper: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  xpCard: { gap: spacing.xs, padding: spacing.lg, borderWidth: 1, borderColor: "#277b82", borderRadius: radius.lg, backgroundColor: "#0d1d26" },
  xpValue: { color: colors.cyan, fontSize: 32, fontWeight: "800" },
  xpMeta: { color: colors.violetSoft, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  xpRationale: { marginTop: spacing.xs, color: colors.text, fontSize: 14, lineHeight: 21 },
  aiOfflineCard: { padding: spacing.md, flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, borderWidth: 1, borderColor: "#6c5531", borderRadius: radius.md, backgroundColor: "#181522" },
  aiOfflineTitle: { color: colors.gold, fontSize: 14, fontWeight: "800" },
  estimateButton: { minHeight: 52, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.violet },
  estimateLabel: { color: colors.text, fontSize: 14, fontWeight: "800" },
  zeroButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  zeroButtonActive: { borderColor: colors.cyan, backgroundColor: "#0f2028" },
  zeroLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  summaryCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  summaryRow: { minHeight: 62, padding: spacing.md, gap: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  summaryLabel: { color: colors.textMuted, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  summaryValue: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  summaryAccent: { color: colors.cyan, fontSize: 19 },
  error: { marginTop: spacing.md, color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: "center" },
  footer: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs, flexDirection: "row", gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: "#0b0d19" },
  backButton: { minHeight: 52, paddingHorizontal: spacing.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  backLabel: { color: colors.textMuted, fontSize: 14, fontWeight: "700" },
  continueButton: { flex: 1, minHeight: 52, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.violet },
  continueLabel: { color: colors.text, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.42 },
});
