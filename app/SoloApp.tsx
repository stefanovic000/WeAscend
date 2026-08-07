"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CheckCircle2, CircleX, Clock3, CopyPlus, History as HistoryIcon, LayoutDashboard, ListChecks, NotebookPen, Pencil, RefreshCcw, RotateCcw, Settings as SettingsIcon, Shield, Trash2, TrendingUp, type LucideIcon } from "lucide-react";
import AuthGate from "./AuthGate";
import OnboardingTutorial from "./OnboardingTutorial";
import { activeXp, addTemplateQuestForDate, allowedXpForCategory, canAwardQuest, deleteAttributeFromState, isUntouchedDemoState, isValidBackup, isValidCloudState, makeInitialState, materializeRoutineInstances, progressFromXp, questTemplateFromQuest, rankForLevel, type AppState, type Quest, type QuestMutation, type QuestTemplate, type QuestType, type XpTransaction } from "./domain";
import { toLocalDateTimeValue, toStoredDateTime } from "./dateTime";
import { clearLegacyState, clearState, loadState, saveState } from "./db";
import { getAccountAuthMethod, getFirebaseIdToken, reauthenticateForAccountDeletion, signOutOfWeAscend, waitForIdentity } from "./firebaseAuth";
import { translate, type Language, type TranslationKey } from "./i18n";
import type { XpSuggestion } from "./xpAdvisor";
import type { BossStepSuggestion } from "./bossStepPlanner";

type View = "dashboard" | "quests" | "growth" | "bosses" | "history" | "settings";
type SyncMode = "starting" | "online" | "syncing" | "offline" | "local";
type CloudStateResponse = {
  state: AppState | null;
  revision: number;
  updatedAt?: string | null;
  user?: { id: string; email: string; name: string; emailVerified: boolean };
  code?: string;
};
type GeneratedBossStep = BossStepSuggestion & { id: string; selected: boolean };
type MotionCue = {
  key: string;
  kind: "complete" | "create" | "archive" | "restore";
  questId: string;
  xp?: number;
};
const views: { id: View; labelKey: TranslationKey; icon: LucideIcon }[] = [
  { id: "dashboard", labelKey: "nav.command", icon: LayoutDashboard },
  { id: "quests", labelKey: "nav.quests", icon: ListChecks },
  { id: "growth", labelKey: "nav.growth", icon: TrendingUp },
  { id: "bosses", labelKey: "nav.bosses", icon: Shield },
  { id: "history", labelKey: "nav.history", icon: HistoryIcon },
  { id: "settings", labelKey: "nav.settings", icon: SettingsIcon },
];

const blankQuest = (state: AppState): Quest => {
  const now = new Date();
  const deadline = new Date(now.getTime() + 3600000);
  const skill = state.skills.find(s => !s.deletedAt && state.attributes.some(a => a.id === s.attributeId && !a.deletedAt));
  const attribute = state.attributes.find(a => a.id === skill?.attributeId && !a.deletedAt);
  return {
    id: crypto.randomUUID(), title: "", description: "", type: "Side",
    attributeId: attribute?.id ?? "", skillId: skill?.id ?? "", xp: 0,
    date: now.toISOString(), deadline: deadline.toISOString(), recurrence: "none",
    difficulty: "Normal", completionConditions: "", failureConsequence: "",
    status: "active", createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
};

const prepareQuestDraft = (quest: Quest): Quest => {
  const xpSource = quest.xpSource === "rules" || !quest.xpSource ? "legacy" : quest.xpSource;
  return {
    ...quest,
    date: toLocalDateTimeValue(quest.date),
    deadline: toLocalDateTimeValue(quest.deadline),
    xpSource,
  };
};

const estimateFingerprint = (quest: Quest, language: Language) => JSON.stringify({
  title: quest.title.trim(),
  description: quest.description.trim(),
  type: quest.type,
  difficulty: quest.difficulty,
  attributeId: quest.attributeId,
  skillId: quest.skillId,
  completionConditions: quest.completionConditions.trim(),
  failureConsequence: quest.failureConsequence.trim(),
  recurrence: quest.recurrence,
  date: quest.date,
  deadline: quest.deadline,
  parentQuestId: quest.parentQuestId ?? "",
  language,
});

const templateEstimateFingerprint = (template: QuestTemplate) => JSON.stringify({
  title: template.title.trim(),
  description: template.description.trim(),
  type: template.type,
  difficulty: template.difficulty,
  attributeId: template.attributeId,
  skillId: template.skillId,
  completionConditions: template.completionConditions.trim(),
  failureConsequence: template.failureConsequence.trim(),
});

const dayKey = (value: string | Date) => new Date(value).toLocaleDateString("sv-SE");
const today = dayKey(new Date());
const LANGUAGE_EVENT = "wesolo-language-change";
const TUTORIAL_QUEST_ID = "weascend-tutorial-preview-quest";
const subscribeLanguage = (onStoreChange: () => void) => {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LANGUAGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LANGUAGE_EVENT, onStoreChange);
  };
};
const getLanguageSnapshot = (): Language => localStorage.getItem("wesolo-language") === "sr" ? "sr" : "en";
const getServerLanguageSnapshot = (): Language => "en";

function Field({ label, children, wide = false, tour }: { label: string; children: React.ReactNode; wide?: boolean; tour?: string }) {
  return <label className={`field ${wide ? "wide" : ""}`} data-tour={tour}><span>{label}</span>{children}</label>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><span>◇</span><strong>{title}</strong><p>{text}</p></div>;
}

async function cloudFetch(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const request = async (forceRefresh = false) => {
      const headers = new Headers(init?.headers);
      const token = await getFirebaseIdToken(forceRefresh);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, signal: controller.signal });
    };
    const response = await request();
    return response.status === 401 && await getFirebaseIdToken() ? request(true) : response;
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function SoloApp() {
  const router = useRouter();
  const language = useSyncExternalStore(subscribeLanguage, getLanguageSnapshot, getServerLanguageSnapshot);
  const [state, setState] = useState<AppState | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>("starting");
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [cloudUser, setCloudUser] = useState<{ id: string; email: string; name: string; emailVerified: boolean } | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [questDraft, setQuestDraft] = useState<Quest | null>(null);
  const [questSaving, setQuestSaving] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<QuestTemplate | null>(null);
  const [templateSuggestion, setTemplateSuggestion] = useState<XpSuggestion | null>(null);
  const [templateEstimating, setTemplateEstimating] = useState(false);
  const [templateAiOffline, setTemplateAiOffline] = useState(false);
  const [xpSuggestion, setXpSuggestion] = useState<XpSuggestion | null>(null);
  const [xpEstimating, setXpEstimating] = useState(false);
  const [xpAiOffline, setXpAiOffline] = useState(false);
  const [lastEstimatedFingerprint, setLastEstimatedFingerprint] = useState("");
  const [questDraftRevision, setQuestDraftRevision] = useState(0);
  const [lastEstimatedRevision, setLastEstimatedRevision] = useState(-1);
  const [xpArgument, setXpArgument] = useState<{ requestedXp: number; reason: string } | null>(null);
  const [argumentUsed, setArgumentUsed] = useState(false);
  const [stepPlanner, setStepPlanner] = useState<{
    bossId: string;
    instruction: string;
    loading: boolean;
    offline: boolean;
    steps: GeneratedBossStep[];
  } | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const [motionCue, setMotionCue] = useState<MotionCue | null>(null);
  const [ceremony, setCeremony] = useState<{ eyebrow: string; title: string; text: string } | null>(null);
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; text: string; action: () => void } | null>(null);
  const [inputDialog, setInputDialog] = useState<{
    title: string;
    label: string;
    value: string;
    description?: string;
    placeholder?: string;
    submitLabel: string;
    multiline?: boolean;
    inputType?: "text" | "password";
    required?: boolean;
    maxLength?: number;
    compact?: boolean;
    clearLabel?: string;
    clearAction?: () => void;
    danger?: boolean;
    action: (value: string) => void;
  } | null>(null);
  const [filters, setFilters] = useState({ search: "", type: "all", status: "all", attribute: "all" });
  const [selectedDate, setSelectedDate] = useState(today);
  const [calendarMonth, setCalendarMonth] = useState(`${today.slice(0, 7)}-01`);
  const [showAllDates, setShowAllDates] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const revisionRef = useRef(0);
  const hydratedRef = useRef(false);
  const lastSyncedRef = useRef("");
  const pendingStateRef = useRef<AppState | null>(null);
  const syncInFlightRef = useRef(false);
  const commandInFlightRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncModeRef = useRef<SyncMode>("starting");
  const currentUserIdRef = useRef("");
  const t = (key: TranslationKey, variables?: Record<string, string | number>) => translate(language, key, variables);
  const locale = language === "sr" ? "sr-Latn-RS" : "en-US";
  const formatDate = (value: string, time = true) => value
    ? new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(value))
    : t("common.noDeadline");

  useEffect(() => {
    document.documentElement.lang = language === "sr" ? "sr-Latn" : "en";
  }, [language]);

  const chooseLanguage = (nextLanguage: Language) => {
    localStorage.setItem("wesolo-language", nextLanguage);
    window.dispatchEvent(new Event(LANGUAGE_EVENT));
  };

  useEffect(() => {
    let cancelled = false;
    const setMode = (mode: SyncMode) => {
      syncModeRef.current = mode;
      if (!cancelled) setSyncMode(mode);
    };

    const start = async () => {
      const identity = await waitForIdentity().catch(() => null);
      if (cancelled) return;
      if (!identity) {
        setAuthRequired(true);
        setMode("offline");
        return;
      }
      currentUserIdRef.current = identity.id;
      await clearLegacyState().catch(() => undefined);
      const saved = await loadState(identity.id).catch(() => null);
      const local = saved && isValidBackup(saved) && !isUntouchedDemoState(saved) ? saved : makeInitialState();

      try {
        const response = await cloudFetch("/api/state", { cache: "no-store", credentials: "same-origin" });
        const cloud = await response.json() as CloudStateResponse;
        if (cancelled) return;

        if (response.status === 401) {
          setAuthRequired(true);
          setMode("offline");
          return;
        }
        if (response.status === 403 && cloud.code === "email_verification_required") {
          setAuthRequired(true);
          setMode("offline");
          return;
        }
        if (response.status === 503 && cloud.code === "cloud_not_configured") {
          hydratedRef.current = true;
          setCloudUser(cloud.user ?? null);
          setMode("local");
          setState(local);
          return;
        }
        if (!response.ok) throw new Error(cloud.code || "cloud_unavailable");

        setAuthRequired(false);
        setCloudUser(cloud.user ?? null);
        revisionRef.current = cloud.revision;
        let selected = cloud.state && isValidCloudState(cloud.state) ? cloud.state : null;

        if (!selected) {
          const fresh = makeInitialState();
          const initialization = await cloudFetch("/api/state", {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: fresh, revision: cloud.revision }),
          });
          const initialized = await initialization.json() as CloudStateResponse;
          if ((initialization.ok || initialization.status === 409) && initialized.state && isValidCloudState(initialized.state)) {
            selected = initialized.state;
            revisionRef.current = initialized.revision;
          } else {
            throw new Error(initialized.code || "state_initialization_failed");
          }
        }

        selected ??= makeInitialState();
        lastSyncedRef.current = JSON.stringify(selected);
        pendingStateRef.current = selected;
        hydratedRef.current = true;
        localStorage.setItem("wesolo-cloud-enabled", "1");
        setMode("online");
        setState(selected);
        void saveState(identity.id, selected);
      } catch {
        if (cancelled) return;
        hydratedRef.current = true;
        const wasCloudEnabled = localStorage.getItem("wesolo-cloud-enabled") === "1" || localStorage.getItem("ascend-cloud-enabled") === "1";
        setMode(wasCloudEnabled ? "offline" : "local");
        setState(local);
      }
    };

    void start();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      cancelled = true;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [bootstrapAttempt]);

  useEffect(() => {
    if (syncMode !== "local" && syncMode !== "offline") return;
    const retry = () => setBootstrapAttempt(attempt => attempt + 1);
    const timer = window.setTimeout(retry, 12000);
    window.addEventListener("online", retry);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", retry);
    };
  }, [syncMode]);

  const flushCloudState = useEffectEvent(async () => {
    const snapshot = pendingStateRef.current;
    if (!snapshot || syncInFlightRef.current || syncModeRef.current === "offline" || syncModeRef.current === "local") return;
    const hash = JSON.stringify(snapshot);
    if (hash === lastSyncedRef.current) return;

    syncInFlightRef.current = true;
    syncModeRef.current = "syncing";
    setSyncMode("syncing");
    try {
      const response = await cloudFetch("/api/state", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: snapshot, revision: revisionRef.current }),
      });
      const result = await response.json() as CloudStateResponse;

      if (response.status === 401 || (response.status === 403 && result.code === "email_verification_required")) {
        const confirmed = lastSyncedRef.current;
        if (confirmed) {
          const restored: unknown = JSON.parse(confirmed);
          if (isValidCloudState(restored)) {
            pendingStateRef.current = restored;
            setState(restored);
            if (currentUserIdRef.current) void saveState(currentUserIdRef.current, restored);
          }
        }
        setAuthRequired(response.status === 401);
        syncModeRef.current = "offline";
        setSyncMode("offline");
        return;
      }
      if (response.status === 409 && result.state && isValidCloudState(result.state)) {
        revisionRef.current = result.revision;
        lastSyncedRef.current = JSON.stringify(result.state);
        pendingStateRef.current = result.state;
        setState(result.state);
        setToast(t("sync.conflict"));
      } else if (response.ok && result.state && isValidCloudState(result.state)) {
        revisionRef.current = result.revision;
        lastSyncedRef.current = JSON.stringify(result.state);
        setCloudUser(result.user ?? cloudUser);
        localStorage.setItem("wesolo-cloud-enabled", "1");
      } else {
        throw new Error(result.code || "sync_failed");
      }
      syncModeRef.current = "online";
      setSyncMode("online");
    } catch {
      syncModeRef.current = "offline";
      setSyncMode("offline");
      const confirmed = lastSyncedRef.current;
      if (confirmed) {
        try {
          const restored: unknown = JSON.parse(confirmed);
          if (isValidCloudState(restored)) {
            pendingStateRef.current = restored;
            setState(restored);
            if (currentUserIdRef.current) void saveState(currentUserIdRef.current, restored);
          }
        } catch {
          // Keep the already loaded read-only snapshot if the confirmed cache is unavailable.
        }
      }
      setToast(t("sync.saveFailed"));
    } finally {
      syncInFlightRef.current = false;
      const pending = pendingStateRef.current;
      if (pending && JSON.stringify(pending) !== lastSyncedRef.current && syncModeRef.current === "online") {
        syncTimerRef.current = setTimeout(() => void flushCloudState(), 250);
      }
    }
  });

  useEffect(() => {
    if (!state || !hydratedRef.current) return;
    pendingStateRef.current = state;
    if (currentUserIdRef.current) saveState(currentUserIdRef.current, state).catch(() => setToast(translate(language, "sync.cacheFailed")));
    if (syncModeRef.current !== "online" && syncModeRef.current !== "syncing") return;
    if (JSON.stringify(state) === lastSyncedRef.current) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => void flushCloudState(), 550);
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [state, language]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!motionCue) return;
    const timer = window.setTimeout(() => setMotionCue(null), 850);
    return () => window.clearTimeout(timer);
  }, [motionCue]);

  useEffect(() => {
    if (syncMode !== "online") return;
    const materialize = () => setState(current => current ? materializeRoutineInstances(current, new Date()) : current);
    materialize();
    const timer = window.setInterval(materialize, 60_000);
    return () => window.clearInterval(timer);
  }, [syncMode]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const metrics = useMemo(() => {
    if (!state) return null;
    const xp = activeXp(state.transactions);
    const progress = progressFromXp(xp, state.settings);
    return { xp, progress, rank: rankForLevel(progress.level, state.settings.ranks) };
  }, [state]);

  if (authRequired) return <AuthGate language={language} onAuthenticated={() => {
    setAuthRequired(false);
    setSyncMode("starting");
    setBootstrapAttempt(attempt => attempt + 1);
  }} />;
  if (!state || !metrics) return <main className="loading"><div className="loader-mark">W</div><p>{t("loading")}</p></main>;

  const readOnly = syncMode === "offline" || syncMode === "local";
  const shouldAnimate = () => state.settings.animations && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ensureWritable = () => {
    if (readOnly) {
      setToast(t("sync.readOnlyToast"));
      return false;
    }
    if (commandBusy) {
      setToast(t("sync.saving"));
      return false;
    }
    return true;
  };
  const updateState = (recipe: (current: AppState) => AppState) => {
    if (!ensureWritable()) return false;
    setState(current => current ? recipe(current) : current);
    return true;
  };

  const openTutorialQuest = () => {
    const draft = blankQuest(state);
    openQuestEditor({
      ...draft,
      id: TUTORIAL_QUEST_ID,
      title: t("tutorial.exampleQuestTitle"),
      description: t("tutorial.exampleQuestDescription"),
      completionConditions: t("tutorial.exampleQuestCondition"),
    });
  };

  const goToTutorialStep = (nextStep: number) => {
    const next = Math.max(0, Math.min(12, nextStep));
    const editorStep = next >= 5 && next <= 9;
    setTutorialStep(next);
    setTemplateDraft(null);
    setStepPlanner(null);
    if (!editorStep && questDraft?.id === TUTORIAL_QUEST_ID) setQuestDraft(null);
    if (next === 0) setView("dashboard");
    else if (next <= 2) setView("growth");
    else if (next <= 4) setView("quests");
    else if (editorStep) {
      setView("quests");
      if (questDraft?.id !== TUTORIAL_QUEST_ID) openTutorialQuest();
    } else if (next === 10) setView("bosses");
    else if (next === 11) setView("history");
    else setView("settings");
  };

  const finishTutorial = () => {
    if (state.settings.tutorialCompleted !== true) {
      const saved = updateState(current => ({ ...current, settings: { ...current.settings, tutorialCompleted: true } }));
      if (!saved) return;
    }
    if (questDraft?.id === TUTORIAL_QUEST_ID) setQuestDraft(null);
    setTutorialStep(null);
  };

  const deleteCurrentAccount = async (password?: string) => {
    try {
      await reauthenticateForAccountDeletion(password);
      const userId = cloudUser?.id ?? "";
      const response = await cloudFetch("/api/account", { method: "DELETE", credentials: "same-origin" }, 15_000);
      if (!response.ok) throw new Error("account_deletion_failed");
      if (userId) await clearState(userId).catch(() => undefined);
      await signOutOfWeAscend().catch(() => undefined);
      setConfirmAction(null);
      setCloudUser(null);
      setState(null);
      setSyncMode("offline");
      setAuthRequired(true);
      router.replace("/");
    } catch (reason) {
      setConfirmAction(null);
      const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
      setToast(code === "auth/wrong-password" || code === "auth/invalid-credential"
        ? t("settings.deleteAccountWrongPassword")
        : code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request"
          ? t("settings.deleteAccountCancelled")
          : t("settings.deleteAccountFailed"));
    }
  };

  const requestAccountDeletion = async () => {
    try {
      const method = await getAccountAuthMethod();
      if (method === "password") {
        setInputDialog({
          title: t("settings.deleteAccountTitle"),
          label: t("settings.deleteAccountPassword"),
          value: "",
          description: t("settings.deleteAccountConfirm"),
          inputType: "password",
          placeholder: t("settings.deleteAccountPasswordPlaceholder"),
          submitLabel: t("settings.deleteAccount"),
          required: true,
          maxLength: 128,
          danger: true,
          action: value => { void deleteCurrentAccount(value); },
        });
        return;
      }
      setConfirmAction({
        title: t("settings.deleteAccountTitle"),
        text: t("settings.deleteAccountGoogleConfirm"),
        action: () => void deleteCurrentAccount(),
      });
    } catch {
      setToast(t("settings.deleteAccountFailed"));
    }
  };

  const runQuestMutation = async (mutation: QuestMutation) => {
    if (!ensureWritable() || commandInFlightRef.current) return null;
    commandInFlightRef.current = true;
    setCommandBusy(true);

    try {
      for (let attempt = 0; attempt < 200; attempt++) {
        const pending = pendingStateRef.current;
        if (!syncInFlightRef.current && pending && JSON.stringify(pending) === lastSyncedRef.current) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      const pending = pendingStateRef.current;
      if (syncModeRef.current !== "online" || syncInFlightRef.current || !pending || JSON.stringify(pending) !== lastSyncedRef.current) {
        setToast(t("sync.saveFailed"));
        return null;
      }

      for (let attempt = 0; attempt < 2; attempt++) {
        syncInFlightRef.current = true;
        syncModeRef.current = "syncing";
        setSyncMode("syncing");
        const response = await cloudFetch("/api/quests", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...mutation, revision: revisionRef.current }),
        });
        const result = await response.json() as CloudStateResponse;
        syncInFlightRef.current = false;

        if (response.status === 401 || (response.status === 403 && result.code === "email_verification_required")) {
          setAuthRequired(response.status === 401);
          syncModeRef.current = "offline";
          setSyncMode("offline");
          return null;
        }

        if (response.status === 409 && result.state && isValidCloudState(result.state)) {
          revisionRef.current = result.revision;
          lastSyncedRef.current = JSON.stringify(result.state);
          pendingStateRef.current = result.state;
          if (attempt === 0) continue;
          setState(result.state);
          if (currentUserIdRef.current) void saveState(currentUserIdRef.current, result.state);
          setToast(t("sync.conflict"));
          syncModeRef.current = "online";
          setSyncMode("online");
          return null;
        }

        if (!response.ok || !result.state || !isValidCloudState(result.state)) {
          setToast(t("sync.saveFailed"));
          syncModeRef.current = "online";
          setSyncMode("online");
          return null;
        }

        revisionRef.current = result.revision;
        lastSyncedRef.current = JSON.stringify(result.state);
        pendingStateRef.current = result.state;
        setCloudUser(result.user ?? cloudUser);
        setState(result.state);
        if (currentUserIdRef.current) void saveState(currentUserIdRef.current, result.state);
        syncModeRef.current = "online";
        setSyncMode("online");
        return result.state;
      }
    } catch {
      syncInFlightRef.current = false;
      syncModeRef.current = "offline";
      setSyncMode("offline");
      setToast(t("sync.saveFailed"));
    } finally {
      commandInFlightRef.current = false;
      setCommandBusy(false);
    }
    return null;
  };
  const attrName = (id: string) => state.attributes.find(a => a.id === id)?.name ?? t("common.unassigned");
  const skillName = (id: string) => state.skills.find(s => s.id === id)?.name ?? t("common.general");
  const transactionTitle = (transaction: XpTransaction) => {
    const questTitle = state.quests.find(quest => quest.id === transaction.questId)?.title;
    if (questTitle) return questTitle;
    if (transaction.questId.startsWith("boss:")) {
      return state.bosses.find(boss => `boss:${boss.id}` === transaction.questId)?.title ?? t("dashboard.bossEncounter");
    }
    return t("common.deletedQuest");
  };
  const attrColor = (id: string) => state.attributes.find(a => a.id === id)?.color ?? "#866bff";
  const availableAttributes = state.attributes.filter(attribute => !attribute.deletedAt);
  const availableSkills = state.skills.filter(skill => !skill.deletedAt && availableAttributes.some(attribute => attribute.id === skill.attributeId));
  const activeQuests = state.quests.filter(q => q.status === "active");
  const openBossQuests = state.quests.filter(q => q.type === "Boss" && q.status !== "completed" && q.status !== "archived");
  const questTemplates = state.questTemplates ?? [];
  const todayQuests = activeQuests.filter(q => dayKey(q.date) === today);
  const mainQuest = todayQuests.find(q => q.type === "Main") ?? activeQuests.find(q => q.type === "Main");

  const recordBossAttempt = async (boss: Quest, outcome: "failed" | "cleared", result: string) => {
    const before = metrics;
    const saved = await runQuestMutation({
      action: "boss_attempt",
      bossQuestId: boss.id,
      outcome,
      result: result.trim(),
    });
    if (!saved) return;

    if (outcome === "failed") {
      setToast(t("boss.attemptRecorded"));
      return;
    }

    const afterXp = activeXp(saved.transactions);
    const afterProgress = progressFromXp(afterXp, saved.settings);
    const afterRank = rankForLevel(afterProgress.level, saved.settings.ranks);
    if (afterRank !== before.rank) {
      setCeremony({ eyebrow: t("ceremony.rankAscension"), title: `${afterRank}-RANK`, text: t("quest.rankUp") });
    } else if (afterProgress.level > before.progress.level) {
      setCeremony({ eyebrow: t("ceremony.levelUp"), title: `LEVEL ${afterProgress.level}`, text: t("quest.levelUp", { xp: afterProgress.needed }) });
    } else {
      setCeremony({ eyebrow: t("ceremony.dungeonConquered"), title: t("ceremony.bossClear"), text: `${boss.title} · +${boss.xp} XP` });
    }
  };

  const openBossAttemptDialog = (boss: Quest, outcome: "failed" | "cleared") => {
    if (!ensureWritable()) return;
    setInputDialog({
      title: outcome === "cleared" ? t("boss.clearResult") : t("boss.analysis"),
      label: outcome === "cleared" ? t("boss.resultFor", { name: boss.title }) : t("boss.failureAnalysis"),
      value: "",
      placeholder: outcome === "cleared" ? t("boss.resultPlaceholder") : t("boss.failurePlaceholder"),
      submitLabel: outcome === "cleared" ? t("boss.confirmClear") : t("boss.recordFailure"),
      multiline: true,
      required: true,
      maxLength: 1_000,
      action: value => { void recordBossAttempt(boss, outcome, value); },
    });
  };

  const completeQuest = (quest: Quest) => {
    if (quest.type === "Boss") {
      openBossAttemptDialog(quest, "cleared");
      return;
    }
    if (!ensureWritable()) return;
    if (!canAwardQuest(quest.id, state.transactions)) {
      setToast(t("quest.alreadyAwarded"));
      return;
    }
    const before = metrics.progress;
    const oldRank = metrics.rank;
    const stamp = new Date().toISOString();
    const transaction = quest.xp > 0 ? {
      id: crypto.randomUUID(), questId: quest.id, amount: quest.xp, kind: "quest" as const,
      attributeId: quest.attributeId, skillId: quest.skillId, createdAt: stamp,
    } : null;
    const nextTransactions = transaction ? [...state.transactions, transaction] : state.transactions;
    const after = progressFromXp(activeXp(nextTransactions), state.settings);
    const newRank = rankForLevel(after.level, state.settings.ranks);
    if (shouldAnimate()) {
      setMotionCue({
        key: `complete:${quest.id}`,
        kind: "complete",
        questId: quest.id,
        xp: newRank === oldRank && after.level === before.level && quest.xp > 0 ? quest.xp : undefined,
      });
    }
    updateState(s => ({
      ...s,
      quests: s.quests.map(q => q.id === quest.id ? { ...q, status: "completed" as const, completedAt: stamp, updatedAt: stamp } : q),
      transactions: nextTransactions,
      levelEvents: [
        ...s.levelEvents,
        ...(after.level > before.level ? [{ id: crypto.randomUUID(), type: "level" as const, value: String(after.level), createdAt: stamp }] : []),
        ...(newRank !== oldRank ? [{ id: crypto.randomUUID(), type: "rank" as const, value: newRank, createdAt: stamp }] : []),
      ],
    }));
    if (newRank !== oldRank) setCeremony({ eyebrow: t("ceremony.rankAscension"), title: `${newRank}-RANK`, text: t("quest.rankUp") });
    else if (after.level > before.level) setCeremony({ eyebrow: t("ceremony.levelUp"), title: `LEVEL ${after.level}`, text: t("quest.levelUp", { xp: after.needed }) });
    else if (quest.type === "Boss") setCeremony({ eyebrow: t("ceremony.dungeonConquered"), title: t("ceremony.bossClear"), text: `${quest.title} · +${quest.xp} XP` });
    else setToast(quest.xp ? t("quest.xpRecorded", { xp: quest.xp }) : t("quest.completedZero"));
  };

  const failQuest = (quest: Quest) => {
    if (quest.type === "Boss") {
      openBossAttemptDialog(quest, "failed");
      return;
    }
    if (!ensureWritable()) return;
    updateState(s => ({ ...s, quests: s.quests.map(q => q.id === quest.id ? { ...q, status: "failed", updatedAt: new Date().toISOString() } : q) }));
    if (quest.type === "Mandatory" && quest.failureConsequence) {
      setCeremony({ eyebrow: t("ceremony.mandatoryFailed"), title: t("ceremony.consequenceActive"), text: quest.failureConsequence });
    } else setToast(t("quest.failedZero"));
  };

  const retryQuest = async (quest: Quest) => {
    if (!ensureWritable()) return;
    const stamp = new Date().toISOString();
    const previousStart = new Date(quest.date).getTime();
    const previousDeadline = quest.deadline ? new Date(quest.deadline).getTime() : Number.NaN;
    const windowMs = Number.isFinite(previousStart) && Number.isFinite(previousDeadline) && previousDeadline > previousStart
      ? previousDeadline - previousStart
      : 60 * 60 * 1_000;
    const retry: Quest = {
      ...quest,
      id: crypto.randomUUID(),
      seriesId: quest.seriesId ?? quest.id,
      date: stamp,
      deadline: new Date(new Date(stamp).getTime() + windowMs).toISOString(),
      note: undefined,
      status: "active",
      archivedFromStatus: undefined,
      completedAt: undefined,
      createdAt: stamp,
      updatedAt: stamp,
    };
    const saved = await runQuestMutation({ action: "create", quest: retry });
    if (!saved) return;
    if (shouldAnimate()) setMotionCue({ key: `retry:${retry.id}`, kind: "create", questId: retry.id });
    setToast(t("quest.retryCreated"));
  };

  const undoQuest = (quest: Quest) => {
    if (quest.type === "Boss") {
      void runQuestMutation({ action: "undo_boss_clear", bossQuestId: quest.id }).then(saved => {
        if (saved) setToast(t("quest.undoDone"));
      });
      return;
    }
    if (!ensureWritable()) return;
    const stamp = new Date().toISOString();
    updateState(s => ({
      ...s,
      quests: s.quests.map(q => q.id === quest.id ? { ...q, status: "active", completedAt: undefined, updatedAt: stamp } : q),
      transactions: s.transactions.map(tx => tx.questId === quest.id && !tx.reversedAt ? { ...tx, reversedAt: stamp } : tx),
    }));
    setToast(t("quest.undoDone"));
  };

  const saveQuest = async () => {
    if (questDraft?.id === TUTORIAL_QUEST_ID) return;
    if (!ensureWritable()) return;
    if (questSaving) return;
    if (!questDraft?.title.trim()) { setToast(t("quest.enterName")); return; }
    if (!questDraft.attributeId || !questDraft.skillId) { setToast(t("quest.choosePath")); return; }
    const storedDate = toStoredDateTime(questDraft.date);
    if (!storedDate) { setToast(t("quest.enterDate")); return; }
    const exists = state.quests.some(q => q.id === questDraft.id);
    const manualAllowed = state.settings.manualXpOverride === true;
    const keepChosenXp = questDraft.xpSource === "ai" || questDraft.xpSource === "argument" || (manualAllowed && questDraft.xpSource === "manual") || questDraft.xpSource === "legacy";
    const updated = {
      ...questDraft,
      note: questDraft.note?.trim().slice(0, 500) || undefined,
      updatedAt: new Date().toISOString(),
      date: storedDate,
      deadline: toStoredDateTime(questDraft.deadline),
      xp: keepChosenXp ? Math.max(0, Number(questDraft.xp) || 0) : 0,
      xpSource: keepChosenXp ? questDraft.xpSource : undefined,
    };
    setQuestSaving(true);
    try {
      const saved = await runQuestMutation({ action: exists ? "update" : "create", quest: updated });
      if (!saved) return;
      if (!exists && shouldAnimate()) {
        setMotionCue({ key: `create:${updated.id}`, kind: "create", questId: updated.id });
      }
      setQuestDraft(null);
      setToast(exists ? t("quest.updated") : t("quest.created"));
    } finally {
      setQuestSaving(false);
    }
  };

  const updateQuestDraft = (next: Quest) => {
    const contentChanged = questDraft ? estimateFingerprint(questDraft, language) !== estimateFingerprint(next, language) : true;
    const aiScoreInvalidated = contentChanged && (questDraft?.xpSource === "ai" || questDraft?.xpSource === "argument");
    const scored = aiScoreInvalidated
      ? { ...next, xp: 0, xpCategory: undefined, xpSource: undefined, xpArgumentReason: undefined }
      : next;
    setQuestDraft(scored);
    setQuestDraftRevision(current => current + 1);
    setXpArgument(null);
    setXpAiOffline(false);
  };

  const openQuestEditor = (quest: Quest) => {
    setXpSuggestion(null);
    setXpArgument(null);
    setLastEstimatedFingerprint("");
    setQuestDraftRevision(0);
    setLastEstimatedRevision(-1);
    setArgumentUsed(false);
    setXpAiOffline(false);
    setQuestDraft(prepareQuestDraft(quest));
  };

  const changeQuestType = (type: QuestType) => {
    if (!questDraft) return;
    updateQuestDraft({ ...questDraft, type, parentQuestId: type === "Boss" ? undefined : questDraft.parentQuestId });
  };

  const xpRequestBody = (draft: Quest) => ({
    title: draft.title,
    description: draft.description,
    type: draft.type,
    difficulty: draft.difficulty,
    attribute: attrName(draft.attributeId),
    skill: skillName(draft.skillId),
    parentBoss: draft.parentQuestId ? state.quests.find(quest => quest.id === draft.parentQuestId)?.title ?? "" : "",
    completionConditions: draft.completionConditions,
    language,
  });

  const estimateQuestXp = async () => {
    if (!questDraft || !ensureWritable()) return;
    if (!questDraft.title.trim()) {
      setToast(t("quest.enterBeforeAi"));
      return;
    }
    const fingerprint = estimateFingerprint(questDraft, language);
    if (lastEstimatedRevision === questDraftRevision && fingerprint === lastEstimatedFingerprint) {
      setToast(t("ai.changeRequired"));
      return;
    }

    setXpEstimating(true);
    setXpAiOffline(false);
    setXpSuggestion(null);
    try {
      const response = await cloudFetch("/api/xp-estimate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...xpRequestBody(questDraft), mode: "estimate" }),
      }, 22_000);
      const result = await response.json() as { suggestion?: XpSuggestion; code?: string };

      if (!response.ok || !result.suggestion) {
        setXpAiOffline(true);
        setToast(t("ai.offline"));
        return;
      }

      setXpSuggestion(result.suggestion);
      setLastEstimatedFingerprint(fingerprint);
      setLastEstimatedRevision(questDraftRevision);
      setArgumentUsed(false);
    } catch {
      setXpAiOffline(true);
      setToast(t("ai.offline"));
    } finally {
      setXpEstimating(false);
    }
  };

  const argueQuestXp = async () => {
    if (!questDraft || !xpSuggestion || !xpArgument || !ensureWritable()) return;
    const fingerprint = estimateFingerprint(questDraft, language);
    if (fingerprint !== lastEstimatedFingerprint) {
      setXpArgument(null);
      setToast(t("ai.estimateFirst"));
      return;
    }
    if (argumentUsed) {
      setXpArgument(null);
      setToast(t("ai.argumentUsed"));
      return;
    }
    if (xpArgument.reason.trim().length < 10) {
      setToast(t("ai.argumentTooShort"));
      return;
    }

    setXpEstimating(true);
    setXpAiOffline(false);
    try {
      const response = await cloudFetch("/api/xp-estimate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...xpRequestBody(questDraft),
          mode: "argue",
          xpCategory: xpSuggestion.category,
          requestedXp: xpArgument.requestedXp,
          argumentReason: xpArgument.reason,
          previousXp: xpSuggestion.xp,
        }),
      }, 22_000);
      const result = await response.json() as { suggestion?: XpSuggestion; code?: string };
      if (!response.ok || !result.suggestion) {
        setXpAiOffline(true);
        setToast(t("ai.offline"));
        return;
      }
      setXpSuggestion(result.suggestion);
      setArgumentUsed(true);
      setQuestDraft(current => current ? { ...current, xpArgumentReason: xpArgument.reason.trim() } : current);
      setXpArgument(null);
    } catch {
      setXpAiOffline(true);
      setToast(t("ai.offline"));
    } finally {
      setXpEstimating(false);
    }
  };

  const applyXpSuggestion = () => {
    if (!questDraft || !xpSuggestion) return;
    const fromArgument = xpSuggestion.decision !== undefined && xpSuggestion.decision !== "estimate";
    setQuestDraft({
      ...questDraft,
      xp: xpSuggestion.xp,
      xpCategory: xpSuggestion.category,
      focusMinutes: undefined,
      outputBonus: undefined,
      xpRuleValue: undefined,
      xpSource: fromArgument ? "argument" : "ai",
      xpArgumentReason: fromArgument ? questDraft.xpArgumentReason : undefined,
    });
    setXpSuggestion(null);
  };

  const deleteQuest = (quest: Quest) => {
    if (!ensureWritable()) return;
    const linkedSteps = state.quests.filter(item => item.parentQuestId === quest.id);
    setConfirmAction({
      title: t("quest.deleteTitle"),
      text: linkedSteps.length
        ? t("quest.deleteBossText", { count: linkedSteps.length })
        : t("quest.deleteText"),
      action: () => {
        setConfirmAction(null);
        void runQuestMutation({ action: "delete", questId: quest.id }).then(saved => {
          if (saved) setToast(t("quest.deleted"));
        });
      },
    });
  };

  const saveQuestNote = (questId: string, value: string) => {
    const quest = state.quests.find(item => item.id === questId);
    if (!quest) return;
    const note = value.trim().slice(0, 500);
    const stamp = new Date().toISOString();
    void runQuestMutation({
      action: "update",
      quest: { ...quest, note: note || undefined, updatedAt: stamp },
    }).then(saved => {
      if (saved) setToast(note ? t("quest.noteSaved") : t("quest.noteRemoved"));
    });
  };

  const archiveQuest = (quest: Quest) => {
    if (quest.status === "archived" || (motionCue?.questId === quest.id && motionCue.kind === "archive")) return;
    const commitArchive = () => {
      void runQuestMutation({
        action: "update",
        quest: { ...quest, status: "archived", archivedFromStatus: quest.status, updatedAt: new Date().toISOString() },
      }).then(saved => {
        if (saved) setToast(t("quest.archived"));
      });
    };
    if (!shouldAnimate()) {
      commitArchive();
      return;
    }
    setMotionCue({ key: `archive:${quest.id}`, kind: "archive", questId: quest.id });
    window.setTimeout(commitArchive, 220);
  };

  const restoreQuest = (quest: Quest) => {
    if (quest.status !== "archived" || (motionCue?.questId === quest.id && motionCue.kind === "restore")) return;
    const commitRestore = () => {
      void runQuestMutation({
        action: "update",
        quest: { ...quest, status: quest.archivedFromStatus ?? "active", archivedFromStatus: undefined, updatedAt: new Date().toISOString() },
      }).then(saved => {
        if (saved) setToast(t("quest.restored"));
      });
    };
    if (!shouldAnimate()) {
      commitRestore();
      return;
    }
    setMotionCue({ key: `restore:${quest.id}`, kind: "restore", questId: quest.id });
    window.setTimeout(commitRestore, 220);
  };

  const openQuestNote = (quest: Quest) => {
    if (!ensureWritable()) return;
    setInputDialog({
      title: t("quest.noteTitle"),
      label: t("quest.noteLabel"),
      value: quest.note ?? "",
      placeholder: t("quest.notePlaceholder"),
      submitLabel: t("quest.noteSave"),
      multiline: true,
      maxLength: 500,
      compact: true,
      clearLabel: quest.note ? t("quest.noteClear") : undefined,
      clearAction: quest.note ? () => saveQuestNote(quest.id, "") : undefined,
      action: value => saveQuestNote(quest.id, value),
    });
  };

  const addAttribute = () => {
    if (!ensureWritable()) return;
    setInputDialog({
      title: t("attribute.newTitle"), label: t("attribute.name"), value: "", placeholder: t("attribute.placeholder"),
      submitLabel: t("attribute.create"), required: true,
      action: name => {
        const stamp = new Date().toISOString();
        updateState(s => ({ ...s, attributes: [...s.attributes, { id: crypto.randomUUID(), name: name.trim(), color: ["#866bff", "#32d6c5", "#4ea5ff", "#ff6da8"][s.attributes.length % 4], createdAt: stamp, updatedAt: stamp }] }));
        setToast(t("attribute.created"));
      },
    });
  };
  const addSkill = (attributeId: string) => {
    if (!ensureWritable()) return;
    setInputDialog({
      title: t("skill.newTitle"), label: t("skill.name"), value: "", placeholder: t("skill.placeholder"),
      submitLabel: t("skill.create"), required: true,
      action: name => {
        const stamp = new Date().toISOString();
        updateState(s => ({ ...s, skills: [...s.skills, { id: crypto.randomUUID(), attributeId, name: name.trim(), createdAt: stamp, updatedAt: stamp }] }));
        setToast(t("skill.created"));
      },
    });
  };
  const deleteSkill = (skillId: string) => {
    if (!ensureWritable()) return;
    const skill = state.skills.find(item => item.id === skillId);
    if (!skill) return;
    const hasHistory = state.quests.some(quest => quest.skillId === skillId) || state.transactions.some(tx => tx.skillId === skillId);
    setConfirmAction({
      title: t("skill.deleteTitle", { name: skill.name }),
      text: hasHistory
        ? t("skill.deleteHistory")
        : t("skill.deleteClean"),
      action: () => {
        const stamp = new Date().toISOString();
        updateState(s => ({
          ...s,
          skills: hasHistory
            ? s.skills.map(item => item.id === skillId ? { ...item, deletedAt: stamp, updatedAt: stamp } : item)
            : s.skills.filter(item => item.id !== skillId),
        }));
        setConfirmAction(null);
        setToast(t("skill.deleted"));
      },
    });
  };
  const deleteAttribute = (attributeId: string) => {
    if (!ensureWritable()) return;
    const attribute = state.attributes.find(item => item.id === attributeId);
    if (!attribute) return;
    const relatedSkills = state.skills.filter(skill => skill.attributeId === attributeId);
    const hasHistory =
      state.quests.some(quest => quest.attributeId === attributeId) ||
      state.transactions.some(tx => tx.attributeId === attributeId) ||
      relatedSkills.some(skill => !!skill.deletedAt);
    setConfirmAction({
      title: t("attribute.deleteTitle", { name: attribute.name }),
      text: hasHistory ? t("attribute.deleteHistory") : t("attribute.deleteClean"),
      action: () => {
        updateState(current => deleteAttributeFromState(current, attributeId));
        setConfirmAction(null);
        setToast(t("attribute.deleted"));
      },
    });
  };
  const beginQuestOnDate = (dateKey: string, type: QuestType = "Side") => {
    if (!ensureWritable()) return;
    if (availableAttributes.length === 0 || availableSkills.length === 0) {
      setView("growth");
      setToast(t("attribute.skillFirst"));
      return;
    }
    const draft = blankQuest(state);
    const date = new Date(`${dateKey}T09:00:00`);
    const deadline = new Date(date.getTime() + 3600000);
    openQuestEditor({
      ...draft,
      type,
      xp: 0,
      difficulty: type === "Boss" ? "Hard" : draft.difficulty,
      date: date.toISOString(),
      deadline: deadline.toISOString(),
    });
  };
  const beginNewQuest = () => beginQuestOnDate(dayKey(new Date()));
  const beginBossQuest = () => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    beginQuestOnDate(dayKey(date), "Boss");
  };
  const beginPreparationQuest = (boss: Quest) => {
    if (!ensureWritable()) return;
    const draft = blankQuest(state);
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    const bossDeadline = boss.deadline ? new Date(boss.deadline).getTime() : Number.NaN;
    const deadline = new Date(Number.isFinite(bossDeadline) && bossDeadline > start.getTime()
      ? Math.min(bossDeadline, start.getTime() + 7 * 86400000)
      : start.getTime() + 3600000);
    openQuestEditor({
      ...draft,
      type: "Side",
      attributeId: boss.attributeId,
      skillId: boss.skillId,
      parentQuestId: boss.id,
      stepOrder: state.quests.filter(quest => quest.parentQuestId === boss.id).length,
      date: start.toISOString(),
      deadline: deadline.toISOString(),
    });
  };
  const openBossStepPlanner = (boss: Quest) => {
    if (!ensureWritable()) return;
    setStepPlanner({ bossId: boss.id, instruction: "", loading: false, offline: false, steps: [] });
  };
  const generateBossSteps = async () => {
    if (!stepPlanner || stepPlanner.instruction.trim().length < 3 || !ensureWritable()) return;
    const boss = state.quests.find(quest => quest.id === stepPlanner.bossId && quest.type === "Boss");
    if (!boss) {
      setStepPlanner(null);
      return;
    }
    const existingTitles = state.quests.filter(quest => quest.parentQuestId === boss.id).map(quest => quest.title);
    setStepPlanner(current => current ? { ...current, loading: true, offline: false, steps: [] } : current);
    try {
      const response = await cloudFetch("/api/boss-steps", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: stepPlanner.instruction,
          language,
          today: dayKey(new Date()),
          existingTitles,
          boss: {
            title: boss.title,
            description: boss.description,
            completionConditions: boss.completionConditions,
            deadline: boss.deadline,
            attribute: attrName(boss.attributeId),
            skill: skillName(boss.skillId),
          },
        }),
      }, 28_000);
      const result = await response.json() as { steps?: BossStepSuggestion[]; code?: string };
      if (!response.ok || !result.steps?.length) {
        setStepPlanner(current => current ? { ...current, loading: false, offline: true, steps: [] } : current);
        setToast(t("ai.offline"));
        return;
      }
      setStepPlanner(current => current ? {
        ...current,
        loading: false,
        offline: false,
        steps: result.steps!.map(step => ({ ...step, id: crypto.randomUUID(), selected: true })),
      } : current);
    } catch {
      setStepPlanner(current => current ? { ...current, loading: false, offline: true, steps: [] } : current);
      setToast(t("ai.offline"));
    }
  };
  const updateGeneratedBossStep = (id: string, patch: Partial<GeneratedBossStep>) => {
    setStepPlanner(current => current ? {
      ...current,
      steps: current.steps.map(step => step.id === id ? { ...step, ...patch } : step),
    } : current);
  };
  const createGeneratedBossSteps = async () => {
    if (!stepPlanner || !ensureWritable()) return;
    const boss = state.quests.find(quest => quest.id === stepPlanner.bossId && quest.type === "Boss");
    if (!boss) {
      setStepPlanner(null);
      return;
    }
    const existingTitles = new Set(state.quests
      .filter(quest => quest.parentQuestId === boss.id)
      .map(quest => quest.title.trim().toLocaleLowerCase().replace(/\s+/g, " ")));
    const selected = stepPlanner.steps.filter(step => step.selected);
    if (!selected.length) {
      setToast(t("boss.noGeneratedSelection"));
      return;
    }
    const usedTitles = new Set(existingTitles);
    const invalidSelection = selected.some(step => {
      const key = step.title.trim().toLocaleLowerCase().replace(/\s+/g, " ");
      const invalid = !key || usedTitles.has(key) || !toStoredDateTime(`${step.date}T09:00`);
      usedTitles.add(key);
      return invalid;
    });
    if (invalidSelection) {
      setToast(t("boss.noGeneratedSelection"));
      return;
    }

    const stamp = new Date().toISOString();
    const firstOrder = state.quests.filter(quest => quest.parentQuestId === boss.id).length;
    const quests: Quest[] = selected.map((step, index) => {
      const date = toStoredDateTime(`${step.date}T09:00`);
      return {
        id: crypto.randomUUID(),
        title: step.title.trim(),
        description: step.description.trim(),
        type: "Side",
        attributeId: boss.attributeId,
        skillId: boss.skillId,
        xp: step.xp,
        xpCategory: "growth",
        xpSource: "ai",
        date,
        deadline: new Date(new Date(date).getTime() + 3_600_000).toISOString(),
        recurrence: "none",
        difficulty: "Normal",
        completionConditions: step.completionConditions.trim(),
        failureConsequence: "",
        status: "active",
        parentQuestId: boss.id,
        stepOrder: firstOrder + index,
        createdAt: stamp,
        updatedAt: stamp,
      };
    });
    const saved = await runQuestMutation({ action: "create_many", quests });
    if (!saved) return;
    setStepPlanner(null);
    setToast(t("boss.generatedCreated", { count: quests.length }));
  };
  const shiftCalendarMonth = (amount: number) => {
    const date = new Date(`${calendarMonth}T12:00:00`);
    date.setMonth(date.getMonth() + amount);
    setCalendarMonth(`${dayKey(date).slice(0, 7)}-01`);
  };

  const saveQuestAsTemplate = (quest: Quest) => {
    if (!ensureWritable()) return;
    if (quest.type === "Boss" || quest.parentQuestId) return;
    if (questTemplates.some(template => template.sourceQuestId === quest.id)) {
      setToast(t("template.exists"));
      return;
    }
    const template = questTemplateFromQuest(quest);
    if (!template) return;
    updateState(current => ({ ...current, questTemplates: [template, ...(current.questTemplates ?? [])] }));
    setToast(t("template.saved"));
  };

  const updateQuestTemplate = (templateId: string, patch: Partial<QuestTemplate>) => {
    if (!ensureWritable()) return;
    const stamp = new Date().toISOString();
    updateState(current => materializeRoutineInstances({
      ...current,
      questTemplates: (current.questTemplates ?? []).map(template => template.id === templateId
        ? { ...template, ...patch, updatedAt: stamp }
        : template),
    }, new Date(), stamp));
  };

  const addTemplateToday = (templateId: string) => {
    if (!ensureWritable()) return;
    const next = addTemplateQuestForDate(state, templateId, dayKey(new Date()));
    if (next === state) {
      setToast(t("template.alreadyToday"));
      return;
    }
    updateState(() => next);
    setSelectedDate(today);
    setShowAllDates(false);
    setToast(t("template.todayAdded"));
  };

  const deleteQuestTemplate = (template: QuestTemplate) => {
    if (!ensureWritable()) return;
    setConfirmAction({
      title: t("template.deleteTitle", { name: template.title }),
      text: t("template.deleteText"),
      action: () => {
        updateState(current => ({ ...current, questTemplates: (current.questTemplates ?? []).filter(item => item.id !== template.id) }));
        setConfirmAction(null);
        setToast(t("template.deleted"));
      },
    });
  };

  const openTemplateEditor = (template: QuestTemplate) => {
    if (!ensureWritable()) return;
    setTemplateSuggestion(null);
    setTemplateAiOffline(false);
    setTemplateDraft({ ...template, weekdays: [...template.weekdays] });
  };

  const updateTemplateDraft = (next: QuestTemplate) => {
    const scoringChanged = templateDraft
      ? templateEstimateFingerprint(templateDraft) !== templateEstimateFingerprint(next)
      : false;
    setTemplateDraft(scoringChanged ? {
      ...next,
      xp: 0,
      xpCategory: undefined,
      focusMinutes: undefined,
      outputBonus: undefined,
      xpRuleValue: undefined,
      xpSource: undefined,
    } : next);
    if (scoringChanged) setTemplateSuggestion(null);
    setTemplateAiOffline(false);
  };

  const estimateTemplateXp = async () => {
    if (!templateDraft || !ensureWritable()) return;
    if (!templateDraft.title.trim()) {
      setToast(t("quest.enterBeforeAi"));
      return;
    }
    setTemplateEstimating(true);
    setTemplateAiOffline(false);
    setTemplateSuggestion(null);
    try {
      const response = await cloudFetch("/api/xp-estimate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: templateDraft.title,
          description: templateDraft.description,
          type: templateDraft.type,
          difficulty: templateDraft.difficulty,
          attribute: attrName(templateDraft.attributeId),
          skill: skillName(templateDraft.skillId),
          parentBoss: "",
          completionConditions: templateDraft.completionConditions,
          language,
          mode: "estimate",
        }),
      }, 22_000);
      const result = await response.json() as { suggestion?: XpSuggestion; code?: string };
      if (!response.ok || !result.suggestion) {
        setTemplateAiOffline(true);
        setToast(t("ai.offline"));
        return;
      }
      setTemplateSuggestion(result.suggestion);
    } catch {
      setTemplateAiOffline(true);
      setToast(t("ai.offline"));
    } finally {
      setTemplateEstimating(false);
    }
  };

  const applyTemplateSuggestion = () => {
    if (!templateDraft || !templateSuggestion) return;
    setTemplateDraft({
      ...templateDraft,
      xp: templateSuggestion.xp,
      xpCategory: templateSuggestion.category,
      focusMinutes: undefined,
      outputBonus: undefined,
      xpRuleValue: undefined,
      xpSource: "ai",
    });
    setTemplateSuggestion(null);
  };

  const saveTemplateDraft = () => {
    if (!templateDraft || !ensureWritable()) return;
    if (!templateDraft.title.trim()) {
      setToast(t("quest.enterName"));
      return;
    }
    const skill = availableSkills.find(item => item.id === templateDraft.skillId && item.attributeId === templateDraft.attributeId);
    if (!skill || !availableAttributes.some(item => item.id === templateDraft.attributeId)) {
      setToast(t("quest.choosePath"));
      return;
    }
    if (templateDraft.schedule === "weekly" && templateDraft.weekdays.length === 0) {
      setToast(t("template.chooseWeekday"));
      return;
    }
    const stamp = new Date().toISOString();
    const savedTemplate: QuestTemplate = {
      ...templateDraft,
      title: templateDraft.title.trim(),
      description: templateDraft.description.trim(),
      completionConditions: templateDraft.completionConditions.trim(),
      failureConsequence: templateDraft.failureConsequence.trim(),
      intervalDays: Math.max(2, Math.min(365, Math.round(templateDraft.intervalDays ?? 2))),
      deadlineOffsetMinutes: Math.max(0, Math.min(43_200, Math.round(templateDraft.deadlineOffsetMinutes) || 0)),
      updatedAt: stamp,
    };
    updateState(current => materializeRoutineInstances({
      ...current,
      questTemplates: (current.questTemplates ?? []).map(template => template.id === savedTemplate.id ? savedTemplate : template),
    }, new Date(), stamp));
    setTemplateDraft(null);
    setTemplateSuggestion(null);
    setToast(t("template.updated"));
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `weascend-backup-${today}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setToast(t("backup.downloaded"));
  };
  const importJson = async (file: File) => {
    if (!ensureWritable()) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isValidCloudState(parsed)) throw new Error("invalid");
      setConfirmAction({
        title: t("backup.replaceTitle"),
        text: t("backup.replaceText"),
        action: () => { updateState(() => parsed); setConfirmAction(null); setToast(t("backup.restored")); },
      });
    } catch { setToast(t("backup.invalid")); }
  };

  const filteredQuests = state.quests.filter(q =>
    (showAllDates || dayKey(q.date) === selectedDate) &&
    (filters.type === "all" || q.type === filters.type) &&
    (filters.status === "all" ? q.status !== "archived" : q.status === filters.status) &&
    (filters.attribute === "all" || q.attributeId === filters.attribute) &&
    (!filters.search || `${q.title} ${q.description} ${q.note ?? ""}`.toLowerCase().includes(filters.search.toLowerCase()))
  ).sort((a, b) => a.date.localeCompare(b.date));

  const renderQuestCard = (quest: Quest, compact = false) => {
    const deadlineTime = quest.deadline ? new Date(quest.deadline).getTime() : Number.NaN;
    const overdue = quest.status === "active" && Number.isFinite(deadlineTime) && deadlineTime < clock;
    const cardMotion = motionCue?.questId === quest.id ? motionCue.kind : null;
    const canRestore = quest.status === "archived" && !quest.parentClosedAt &&
      availableAttributes.some(attribute => attribute.id === quest.attributeId) &&
      availableSkills.some(skill => skill.id === quest.skillId);
    return <article className={`quest-card ${quest.status} ${overdue ? "overdue" : ""} ${cardMotion ? `motion-${cardMotion}` : ""} ${compact ? "compact" : ""}`} key={quest.id}>
      <div className="quest-accent" style={{ background: attrColor(quest.attributeId) }} />
      <div className="quest-card-main">
        <div className="quest-meta">
          <span className={`type-badge type-${quest.type.toLowerCase()}`}>{t(`type.${quest.type}` as TranslationKey)}</span>
          {quest.parentQuestId && <span className="prep-badge">{t("boss.preparationStep")}</span>}
          {quest.templateId && <span className="routine-badge">{t("template.instance")}</span>}
          {overdue && <span className="overdue-badge">{t("quest.overdue")}</span>}
          {quest.status === "failed" && <span className="quest-status-badge failed"><CircleX aria-hidden="true" size={12} />{t("status.failed")}</span>}
          <span>{attrName(quest.attributeId)} / {skillName(quest.skillId)}</span>
        </div>
        <h3>{quest.title}</h3>
        {quest.parentQuestId && <p className="quest-parent">↳ {state.quests.find(item => item.id === quest.parentQuestId)?.title ?? t("common.deletedQuest")}</p>}
        {!compact && quest.description && <p>{quest.description}</p>}
        {quest.note && <button className="quest-note-preview" onClick={() => openQuestNote(quest)} aria-label={t("quest.noteEditLabel", { name: quest.title })}><span><NotebookPen aria-hidden="true" size={14} /></span><em>{quest.note}</em></button>}
        <div className="quest-footer">
          <span><Clock3 aria-hidden="true" size={12} />{formatDate(quest.deadline)}</span>
          <span className="xp-reward">+{quest.xp} XP</span>
          <span className="difficulty">{t(`difficulty.${quest.difficulty}` as TranslationKey)}</span>
        </div>
      </div>
      <div className="quest-actions">
        {quest.status === "active" && <>
          <button className="complete" onClick={() => completeQuest(quest)} aria-label={t("quest.completeLabel", { name: quest.title })} title={t("quest.clear")}><CheckCircle2 aria-hidden="true" size={19} /><span className="action-text">{t("quest.clear")}</span></button>
          <button className="fail-action" onClick={() => failQuest(quest)} aria-label={t("quest.failLabel", { name: quest.title })} title={t("common.failed")}><CircleX aria-hidden="true" size={19} /><span className="action-text">{t("common.failed")}</span></button>
        </>}
        {quest.status === "failed" && <button className="retry-link" onClick={() => void retryQuest(quest)} title={t("quest.retry")}><RefreshCcw aria-hidden="true" size={18} /><span className="action-text">{t("quest.retry")}</span></button>}
        {quest.status === "completed" && <button className="undo-action" onClick={() => undoQuest(quest)} title={t("common.undo")}><RotateCcw aria-hidden="true" size={18} /><span className="action-text">{t("common.undo")}</span></button>}
        <button className={`note-action ${quest.note ? "has-note" : ""}`} onClick={() => openQuestNote(quest)} aria-label={t("quest.noteEditLabel", { name: quest.title })} title={t("quest.note")}><NotebookPen aria-hidden="true" size={18} /><span className="action-text">{t("quest.note")}</span></button>
        {!compact && <>
          {quest.status !== "archived" && canAwardQuest(quest.id, state.transactions) && <button className="secondary-action" onClick={() => { if (ensureWritable()) openQuestEditor(quest); }} title={t("common.edit")}><Pencil aria-hidden="true" size={16} /><span className="action-text">{t("common.edit")}</span></button>}
          {quest.status !== "archived" && quest.type !== "Boss" && !quest.parentQuestId && <button className="secondary-action" onClick={() => saveQuestAsTemplate(quest)} title={t("template.save")}><CopyPlus aria-hidden="true" size={16} /><span className="action-text">{t("template.save")}</span></button>}
          {canRestore
            ? <button className="restore-link secondary-action" onClick={() => restoreQuest(quest)} title={t("common.restore")}><ArchiveRestore aria-hidden="true" size={16} /><span className="action-text">{t("common.restore")}</span></button>
            : quest.status !== "archived" && <button className="secondary-action" onClick={() => archiveQuest(quest)} title={t("common.archive")}><Archive aria-hidden="true" size={16} /><span className="action-text">{t("common.archive")}</span></button>}
          <button className="danger-link secondary-action" onClick={() => deleteQuest(quest)} title={t("common.delete")}><Trash2 aria-hidden="true" size={16} /><span className="action-text">{t("common.delete")}</span></button>
        </>}
      </div>
    </article>;
  };

  const Dashboard = () => {
    const recent = [...state.transactions].filter(tx => !tx.reversedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
    return <div className="screen dashboard-screen">
      <section className="hero" data-tour="dashboard-next">
        <div className="hero-copy">
          <p className="system-label"><span /> {syncMode === "online"
            ? t("sync.online")
            : syncMode === "syncing"
              ? t("sync.syncing")
              : syncMode === "offline"
                ? t("sync.offline")
                : t("sync.local")}</p>
          <p className="kicker">{t("dashboard.directive")}</p>
          <h1>{t("dashboard.question1")}<br /><em>{t("dashboard.question2")}</em></h1>
          <p>{t("dashboard.subtitle")}</p>
          <button className="primary" onClick={beginNewQuest}>{t("dashboard.addQuest")}</button>
        </div>
        <div className="rank-orbit" aria-label={`${metrics.rank} rank, level ${metrics.progress.level}`}>
          <div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" />
          <div className="rank-core"><span>RANK</span><strong>{metrics.rank}</strong><small>LEVEL {String(metrics.progress.level).padStart(2, "0")}</small></div>
        </div>
      </section>
      <section className="xp-panel">
        <div><span>{t("dashboard.globalExperience")}</span><strong>{metrics.xp.toLocaleString(locale)} XP</strong></div>
        <div className="xp-track"><i style={{ width: `${metrics.progress.percent}%` }} /></div>
        <p>{metrics.progress.current} / {metrics.progress.needed} XP <span>{t("dashboard.untilLevel", { xp: metrics.progress.needed - metrics.progress.current, level: metrics.progress.level + 1 })}</span></p>
      </section>
      <div className="dashboard-grid">
        <section className="panel main-mission">
          <div className="section-title"><div><span>01</span><p>{t("dashboard.priority")}</p><h2>{t("dashboard.mainQuest")}</h2></div><button onClick={() => setView("quests")}>{t("dashboard.viewAll")}</button></div>
          {mainQuest ? renderQuestCard(mainQuest, true) : <Empty title={t("quest.mainEmpty")} text={t("quest.mainEmptyText")} />}
        </section>
        <aside className="panel pulse">
          <div className="section-title"><div><span>02</span><p>{t("dashboard.metrics")}</p><h2>{t("dashboard.pulse")}</h2></div></div>
          <div className="pulse-ring" style={{ "--progress": `${todayQuests.length ? Math.round(todayQuests.filter(q => q.status === "completed").length / todayQuests.length * 100) : 0}%` } as React.CSSProperties}>
            <strong>{todayQuests.filter(q => q.status === "completed").length}<small>/{todayQuests.length}</small></strong><span>{t("dashboard.quests")}</span>
          </div>
          <div className="mini-stats"><div><span>{t("dashboard.completed")}</span><strong>{state.quests.filter(q => q.status === "completed").length}</strong></div><div><span>{t("dashboard.failed")}</span><strong>{state.quests.filter(q => q.status === "failed").length}</strong></div></div>
        </aside>
      </div>
      <section className="panel today-list">
        <div className="section-title"><div><span>03</span><p>{t("dashboard.activeLog")}</p><h2>{t("dashboard.todayQuests")}</h2></div><button onClick={beginNewQuest}>{t("dashboard.new")}</button></div>
        <div className="quest-list">{todayQuests.length ? todayQuests.map(q => renderQuestCard(q, true)) : <Empty title={t("quest.dayEmpty")} text={t("quest.dayEmptyText")} />}</div>
      </section>
      <section className="achievements">
        <div className="section-title"><div><span>04</span><p>{t("dashboard.feed")}</p><h2>{t("dashboard.achievements")}</h2></div></div>
        <div className="achievement-grid">
          {recent.length ? recent.map(tx => <div className="achievement" key={tx.id}><i>✦</i><div><strong>{t("dashboard.questCleared")}</strong><span>{transactionTitle(tx)}</span></div><b>+{tx.amount}</b></div>) : <Empty title={t("dashboard.historyEmpty")} text={t("dashboard.historyEmptyText")} />}
        </div>
      </section>
    </div>;
  };

  const Quests = () => {
    const monthDate = new Date(`${calendarMonth}T12:00:00`);
    const gridStart = new Date(monthDate);
    const mondayOffset = (gridStart.getDay() + 6) % 7;
    gridStart.setDate(gridStart.getDate() - mondayOffset);
    const calendarDays = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
    const selectedLabel = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${selectedDate}T12:00:00`));
    const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(monthDate);
    return <div className="screen">
    <header className="screen-header"><div><p>{t("planner.control")}</p><h1>{t("planner.title")}</h1><span>{t("planner.summary", { active: activeQuests.length, cleared: state.quests.filter(q => q.status === "completed").length })}</span></div><button className="primary" data-tour="quest-add" onClick={() => beginQuestOnDate(selectedDate)}>{t("planner.planQuest")}</button></header>
    <section className="planner" data-tour="quest-planner">
      <header className="planner-header">
        <div><p>{t("planner.calendar")}</p><h2>{monthLabel}</h2></div>
        <div className="calendar-controls"><button onClick={() => shiftCalendarMonth(-1)} aria-label={t("planner.previousMonth")}>←</button><button onClick={() => { setSelectedDate(today); setCalendarMonth(`${today.slice(0, 7)}-01`); setShowAllDates(false); }}>{t("planner.today")}</button><button onClick={() => shiftCalendarMonth(1)} aria-label={t("planner.nextMonth")}>→</button></div>
      </header>
      <div className="calendar-weekdays">{t("planner.weekdays").split(",").map(day => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{calendarDays.map(date => {
        const key = dayKey(date);
        const quests = state.quests.filter(q => dayKey(q.date) === key && q.status !== "archived");
        const completed = quests.filter(q => q.status === "completed").length;
        const hasBoss = quests.some(q => q.type === "Boss");
        const outside = date.getMonth() !== monthDate.getMonth();
        return <button key={key} className={`${key === selectedDate ? "selected" : ""} ${key === today ? "today" : ""} ${outside ? "outside" : ""} ${hasBoss ? "boss-day" : ""}`} onClick={() => { setSelectedDate(key); setShowAllDates(false); }}>
          <span>{date.getDate()}</span>{quests.length > 0 && <b>{quests.length}</b>}
          <i>{quests.slice(0, 3).map((quest, index) => <em key={quest.id} style={{ background: quest.type === "Boss" ? "#ff5277" : quest.status === "completed" ? "var(--cyan)" : attrColor(quest.attributeId), opacity: index < completed ? 1 : .75 }} />)}</i>
        </button>;
      })}</div>
      <footer><div><span>{t("planner.selectedDay")}</span><strong>{selectedLabel}</strong></div><button onClick={() => beginQuestOnDate(selectedDate)}>{t("planner.addDay")}</button></footer>
    </section>
    <section className="routine-panel">
      <header>
        <div><p>{t("template.eyebrow")}</p><h2>{t("template.title")}</h2><span>{t("template.subtitle")}</span></div>
        <strong>{questTemplates.length}</strong>
      </header>
      {questTemplates.length === 0
        ? <Empty title={t("template.empty")} text={t("template.emptyText")} />
        : <div className="template-grid">{questTemplates.map(template => {
          const pathAvailable = availableAttributes.some(attribute => attribute.id === template.attributeId) && availableSkills.some(skill => skill.id === template.skillId);
          const alreadyToday = state.quests.some(quest =>
            (quest.templateId === template.id && quest.routineDate === today) ||
            (quest.id === template.sourceQuestId && dayKey(quest.date) === today)
          );
          const weekdayLabels = t("planner.weekdays").split(",");
          const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
          return <article className={!pathAvailable ? "invalid" : ""} key={template.id}>
            <div className="template-main">
              <div className="quest-meta"><span className={`type-badge type-${template.type.toLowerCase()}`}>{t(`type.${template.type}` as TranslationKey)}</span><span>{attrName(template.attributeId)} / {skillName(template.skillId)}</span></div>
              <h3>{template.title}</h3>
              <p>{template.xp} XP · {t(`difficulty.${template.difficulty}` as TranslationKey)}</p>
              {!pathAvailable && <em>{t("template.pathUnavailable")}</em>}
            </div>
            <div className="template-controls">
              <label><span>{t("template.schedule")}</span><select value={template.schedule} disabled={!pathAvailable} onChange={event => {
                const schedule = event.target.value as QuestTemplate["schedule"];
                updateQuestTemplate(template.id, { schedule, intervalDays: schedule === "interval" ? template.intervalDays ?? 2 : template.intervalDays, weekdays: schedule === "weekly" && template.weekdays.length === 0 ? [new Date().getDay()] : template.weekdays, startDate: today });
              }}><option value="none">{t("template.none")}</option><option value="daily">{t("template.daily")}</option><option value="weekly">{t("template.weekly")}</option><option value="interval">{t("template.interval")}</option></select></label>
              <label><span>{t("template.time")}</span><input type="time" value={template.time} disabled={!pathAvailable} onChange={event => updateQuestTemplate(template.id, { time: event.target.value })} /></label>
              {template.schedule === "interval" && <label><span>{t("template.intervalDays")}</span><input type="number" min="2" max="365" value={template.intervalDays ?? 2} disabled={!pathAvailable} onChange={event => updateQuestTemplate(template.id, { intervalDays: Math.max(2, Math.min(365, Number(event.target.value) || 2)), startDate: today })} /></label>}
            </div>
            {template.schedule === "weekly" && <div className="weekday-picker" aria-label={t("template.weekdays")}>
              {weekdayOrder.map((day, index) => <button type="button" key={day} className={template.weekdays.includes(day) ? "active" : ""} disabled={!pathAvailable} onClick={() => updateQuestTemplate(template.id, {
                weekdays: template.weekdays.includes(day) ? template.weekdays.filter(item => item !== day) : [...template.weekdays, day],
              })}>{weekdayLabels[index]}</button>)}
            </div>}
            <footer><button className="template-use" disabled={!pathAvailable || alreadyToday} onClick={() => addTemplateToday(template.id)}>{alreadyToday ? t("template.alreadyAdded") : t("template.addToday")}</button><button onClick={() => openTemplateEditor(template)}>{t("common.edit")}</button><button className="danger-link" onClick={() => deleteQuestTemplate(template)}>{t("common.delete")}</button></footer>
          </article>;
        })}</div>}
    </section>
    <section className="filters">
      <input aria-label={t("planner.searchLabel")} placeholder={t("planner.search")} value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
      <select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}><option value="all">{t("planner.allTypes")}</option>{state.settings.questTypes.map(type => <option key={type} value={type}>{t(`type.${type}` as TranslationKey)}</option>)}</select>
      <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="all">{t("planner.allStatuses")}</option>{(["active", "completed", "failed", "skipped", "archived"] as const).map(status => <option key={status} value={status}>{t(`status.${status}` as TranslationKey)}</option>)}</select>
      <select value={filters.attribute} onChange={e => setFilters({ ...filters, attribute: e.target.value })}><option value="all">{t("planner.allAttributes")}</option>{availableAttributes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
    </section>
    <div className="day-agenda-title"><div><p>{showAllDates ? t("planner.allMissions") : t("planner.dayAgenda")}</p><h2>{showAllDates ? t("planner.allPlanned") : selectedLabel}</h2></div><button onClick={() => setShowAllDates(!showAllDates)}>{showAllDates ? t("planner.showDay") : t("planner.showAll")}</button></div>
    <div className="quest-list full">{filteredQuests.length ? filteredQuests.map(q => renderQuestCard(q)) : <Empty title={t("quest.planEmpty")} text={t("quest.planEmptyText")} />}</div>
  </div>;
  };

  const Growth = () => <div className="screen">
    <header className="screen-header"><div><p>{t("growth.matrix")}</p><h1>{t("growth.title")}</h1><span>{t("growth.subtitle")}</span></div><button className="primary" data-tour="growth-add-attribute" onClick={addAttribute}>{t("growth.addAttribute")}</button></header>
    <div className="attribute-grid" data-tour="growth-grid">{availableAttributes.length === 0 && <Empty title={t("growth.empty")} text={t("growth.emptyText")} />}{availableAttributes.map(attr => {
      const skills = state.skills.filter(s => s.attributeId === attr.id && !s.deletedAt);
      const txs = state.transactions.filter(tx => tx.attributeId === attr.id && !tx.reversedAt);
      const xp = activeXp(txs);
      const max = Math.max(...availableAttributes.map(a => activeXp(state.transactions.filter(tx => tx.attributeId === a.id && !tx.reversedAt))), 1);
      return <section className="attribute-card" key={attr.id} style={{ "--attr": attr.color } as React.CSSProperties}>
        <header><i>{attr.name.charAt(0)}</i><div><span>{t("growth.attribute")}</span><h2>{attr.name}</h2></div><strong>{xp}<small> XP</small></strong><button className="attribute-delete" onClick={() => deleteAttribute(attr.id)} aria-label={t("attribute.deleteLabel", { name: attr.name })}>{t("common.delete")}</button></header>
        <div className="attr-track"><i style={{ width: `${xp / max * 100}%` }} /></div>
        <div className="skill-list">{skills.map(skill => {
          const skillTx = state.transactions.filter(tx => tx.skillId === skill.id && !tx.reversedAt);
          return <div className="skill-row" key={skill.id}><div><strong>{skill.name}</strong><span>{t("growth.cleared", { count: state.quests.filter(q => q.skillId === skill.id && q.status === "completed").length })}</span></div><b>{activeXp(skillTx)} XP</b><button className="skill-delete" onClick={() => deleteSkill(skill.id)} aria-label={t("skill.deleteLabel", { name: skill.name })}>{t("common.delete")}</button></div>;
        })}</div>
        <button className="ghost" onClick={() => addSkill(attr.id)}>{t("growth.addSkill")}</button>
      </section>;
    })}</div>
  </div>;

  const Bosses = () => {
    const bossQuests = state.quests
      .filter(quest => quest.type === "Boss" && quest.status !== "archived")
      .sort((a, b) => (a.status !== "completed" ? 0 : 1) - (b.status !== "completed" ? 0 : 1) || a.date.localeCompare(b.date));
    const editBoss = (quest: Quest) => {
      if (!ensureWritable()) return;
      openQuestEditor(quest);
    };
    return <div className="screen">
      <header className="screen-header" data-tour="bosses"><div><p>{t("boss.gate")}</p><h1>{t("boss.title")}</h1><span>{t("boss.subtitle")}</span></div><button className="primary" onClick={beginBossQuest}>{t("boss.add")}</button></header>
      <div className="boss-grid">{bossQuests.length === 0 && <Empty title={t("boss.empty")} text={t("boss.emptyText")} />}{bossQuests.map(boss => {
        const steps = state.quests
          .filter(quest => quest.parentQuestId === boss.id)
          .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0) || a.createdAt.localeCompare(b.createdAt));
        const completedSteps = steps.filter(step => step.status === "completed").length;
        const attempts = (state.bossAttempts ?? [])
          .filter(attempt => attempt.bossQuestId === boss.id && !attempt.reversedAt)
          .sort((a, b) => b.attemptNumber - a.attemptNumber);
        const open = boss.status !== "completed";
        return <article className={`boss-card ${boss.status}`} key={boss.id}>
          <div className="boss-visual"><span>{open ? attempts.length ? t("boss.gateAttempts", { count: attempts.length }) : t("boss.gateOpen") : t("boss.cleared")}</span><strong>⬡</strong><p>{formatDate(boss.date, false)}</p></div>
          <div className="boss-content">
            <div className="quest-meta"><span className="type-badge type-boss">BOSS</span><span>{attrName(boss.attributeId)} / {skillName(boss.skillId)}</span></div>
            <h2>{boss.title}</h2>
            <dl>
              <div><dt>{t("boss.entry")}</dt><dd>{boss.description || t("boss.noGate")}</dd></div>
              <div><dt>{t("boss.clearCondition")}</dt><dd>{boss.completionConditions || t("boss.defaultClear")}</dd></div>
              <div><dt>{t("boss.deadline")}</dt><dd>{formatDate(boss.deadline)}</dd></div>
            </dl>
            <section className="boss-preparation">
              <header><div><span>{t("boss.preparation")}</span><strong>{completedSteps}/{steps.length}</strong></div>{open && <div className="boss-step-actions"><button onClick={() => openBossStepPlanner(boss)}>✦ {t("boss.generateSteps")}</button><button onClick={() => beginPreparationQuest(boss)}>＋ {t("boss.addStep")}</button></div>}</header>
              {steps.length
                ? <div className="boss-step-list">{steps.map(step => <div className={step.status} key={step.id}>
                  <button className="step-check" onClick={() => step.status === "active" ? completeQuest(step) : undefined} disabled={step.status !== "active"}>{step.status === "completed" ? "✓" : "○"}</button>
                  <span><strong>{step.title}</strong><small>{step.xp} XP · {t(`status.${step.status}` as TranslationKey)}</small></span>
                  {canAwardQuest(step.id, state.transactions) && <button onClick={() => openQuestEditor(step)}>{t("common.edit")}</button>}
                </div>)}</div>
                : <p className="boss-step-empty">{t("boss.noSteps")}</p>}
            </section>
            {attempts.length > 0 && <section className="boss-attempts"><span>{t("boss.attemptHistory")}</span>{attempts.map(attempt => <div key={attempt.id}><b className={attempt.outcome}>{attempt.outcome === "cleared" ? t("boss.cleared") : t("common.failed")}</b><strong>#{attempt.attemptNumber}</strong><p>{attempt.result}</p><time>{formatDate(attempt.createdAt)}</time></div>)}</section>}
            <footer>
              <strong>+{boss.xp} XP</strong>
              <div>
                {open && <><button className="complete-text" onClick={() => completeQuest(boss)}>{t("boss.confirmClearShort")}</button><button onClick={() => failQuest(boss)}>{t("boss.recordAttempt")}</button></>}
                {!open && <button onClick={() => undoQuest(boss)}>{t("common.undo")}</button>}
                {canAwardQuest(boss.id, state.transactions) && <button onClick={() => editBoss(boss)}>{t("common.edit")}</button>}
              </div>
            </footer>
          </div>
        </article>;
      })}</div>
    </div>;
  };

  const History = () => {
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); return d; });
    const dayValues = days.map(d => activeXp(state.transactions.filter(tx => dayKey(tx.createdAt) === dayKey(d))));
    const maxDay = Math.max(...dayValues, 1);
    const byAttribute = state.attributes.map(attr => ({ ...attr, xp: activeXp(state.transactions.filter(tx => tx.attributeId === attr.id)) }));
    return <div className="screen">
      <header className="screen-header"><div><p>{t("history.chronicle")}</p><h1>{t("history.title")}</h1><span>{t("history.subtitle")}</span></div></header>
      <div className="stats-top" data-tour="history"><div><span>{t("history.totalXp")}</span><strong>{metrics.xp}</strong></div><div><span>{t("history.thisWeek")}</span><strong>{activeXp(state.transactions.filter(tx => Date.now() - new Date(tx.createdAt).getTime() < 7 * 86400000))}</strong></div><div><span>{t("history.clearRate")}</span><strong>{state.quests.length ? Math.round(state.quests.filter(q => q.status === "completed").length / state.quests.length * 100) : 0}%</strong></div><div><span>{t("history.currentRank")}</span><strong>{metrics.rank}</strong></div></div>
      <div className="history-grid">
        <section className="panel chart-panel"><div className="section-title"><div><p>{t("history.last14")}</p><h2>{t("history.activity")}</h2></div></div><div className="bar-chart">{dayValues.map((value, i) => <div key={dayKey(days[i])}><i style={{ height: `${Math.max(4, value / maxDay * 100)}%` }} title={`${value} XP`} /><span>{i % 2 ? "" : days[i].getDate()}</span></div>)}</div></section>
        <section className="panel distribution"><div className="section-title"><div><p>{t("history.allocation")}</p><h2>{t("history.byAttribute")}</h2></div></div>{byAttribute.map(attr => <div className="dist-row" key={attr.id}><div><span><i style={{ background: attr.color }} />{attr.name}</span><strong>{attr.xp} XP</strong></div><div><i style={{ width: `${metrics.xp ? attr.xp / metrics.xp * 100 : 0}%`, background: attr.color }} /></div></div>)}</section>
      </div>
      <section className="panel ledger"><div className="section-title"><div><p>{t("history.audit")}</p><h2>{t("history.transactions")}</h2></div></div>
        <div className="ledger-list">{[...state.transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(tx => <div className={tx.reversedAt ? "reversed" : ""} key={tx.id}><span>{formatDate(tx.createdAt)}</span><strong>{transactionTitle(tx)}</strong><em>{attrName(tx.attributeId)} / {skillName(tx.skillId)}</em><b>{tx.reversedAt ? t("history.reversed") : `+${tx.amount} XP`}</b></div>)}</div>
      </section>
    </div>;
  };

  const SettingsView = () => <div className="screen settings-screen">
    <header className="screen-header"><div><p>{t("settings.configuration")}</p><h1>{t("settings.title")}</h1><span>{t("settings.subtitle")}</span></div></header>
    <div className="settings-grid">
      <section className="settings-card language-card"><header><i>文</i><div><h2>{t("settings.language")}</h2><p>{t("settings.languageText")}</p></div></header><div className="language-switch" role="group" aria-label={t("settings.language")}><button className={language === "en" ? "active" : ""} onClick={() => chooseLanguage("en")}>{t("settings.english")}</button><button className={language === "sr" ? "active" : ""} onClick={() => chooseLanguage("sr")}>{t("settings.serbian")}</button></div></section>
      <section className="settings-card tutorial-settings-card" data-tour="tutorial-replay"><header><i>?</i><div><h2>{t("settings.tutorial")}</h2><p>{t("settings.tutorialText")}</p></div></header><button className="primary" onClick={() => goToTutorialStep(0)}>{t("settings.tutorialAction")}</button></section>
      <section className="settings-card cloud-card"><header><i>↻</i><div><h2>{t("settings.cloud")}</h2><p>{t("settings.cloudText")}</p></div></header><div className="cloud-status-row"><span className={`sync-dot ${syncMode}`} /><div><strong>{syncMode === "online" ? t("settings.synced") : syncMode === "syncing" ? t("settings.saving") : syncMode === "offline" ? t("settings.disconnected") : t("settings.notConnected")}</strong><small>{cloudUser?.email ?? (syncMode === "local" ? t("settings.localMode") : "WeAscend Cloud")}</small></div>{cloudUser && <button onClick={() => void signOutOfWeAscend().then(() => {
        currentUserIdRef.current = "";
        hydratedRef.current = false;
        setState(null);
        setCloudUser(null);
        setAuthRequired(true);
        setSyncMode("offline");
      })}>{t("settings.signOut")}</button>}</div></section>
      <section className="settings-card"><header><i>ƒ</i><div><h2>{t("settings.formula")}</h2><p>{t("settings.formulaText")}</p></div></header><div className="settings-row"><Field label={t("settings.baseXp")}><input type="number" min="1" value={state.settings.baseXp} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, baseXp: Math.max(1, Number(e.target.value)) } }))} /></Field><Field label={t("settings.growth")}><input type="number" min="0" value={state.settings.levelGrowth} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, levelGrowth: Math.max(0, Number(e.target.value)) } }))} /></Field></div></section>
      <section className="settings-card"><header><i>R</i><div><h2>{t("settings.ranks")}</h2><p>{t("settings.ranksText")}</p></div></header><div className="rank-settings">{state.settings.ranks.map((rank, index) => <Field label={`${rank.name}-Rank`} key={rank.name}><input type="number" min="1" value={rank.minLevel} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, ranks: s.settings.ranks.map((r, i) => i === index ? { ...r, minLevel: Math.max(1, Number(e.target.value)) } : r) } }))} /></Field>)}</div></section>
      <section className="settings-card"><header><i>◈</i><div><h2>{t("settings.rules")}</h2><p>{t("settings.rulesText")}</p></div></header><label className="toggle-row"><div><strong>{t("settings.manualXp")}</strong><span>{t("settings.manualXpText")}</span></div><input type="checkbox" checked={state.settings.manualXpOverride === true} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, manualXpOverride: e.target.checked } }))} /></label><label className="toggle-row"><div><strong>{t("settings.animations")}</strong><span>{t("settings.animationsText")}</span></div><input type="checkbox" checked={state.settings.animations} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, animations: e.target.checked } }))} /></label><label className="toggle-row"><div><strong>{t("settings.spellcheck")}</strong><span>{t("settings.spellcheckText")}</span></div><input type="checkbox" checked={state.settings.spellcheck !== false} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, spellcheck: e.target.checked } }))} /></label></section>
      <section className="settings-card"><header><i>⇅</i><div><h2>{t("settings.backup")}</h2><p>{t("settings.backupText")}</p></div></header><div className="button-row"><button className="primary" onClick={exportJson}>{t("settings.export")}</button><button onClick={() => importRef.current?.click()}>{t("settings.import")}</button><input ref={importRef} hidden type="file" accept="application/json" onChange={e => e.target.files?.[0] && importJson(e.target.files[0])} /></div></section>
      <section className="settings-card account-card"><header><i>@</i><div><h2>{t("settings.account")}</h2><p>{t("settings.accountText")}</p></div></header><div className="account-summary"><div><strong>{cloudUser?.name}</strong><small>{cloudUser?.email}</small></div><div className="account-actions"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><button className="danger" onClick={() => void requestAccountDeletion()}>{t("settings.deleteAccount")}</button></div></div></section>
      <section className="settings-card danger-zone"><header><i>!</i><div><h2>{t("settings.reset")}</h2><p>{t("settings.resetText")}</p></div></header><button onClick={() => ensureWritable() && setConfirmAction({ title: t("settings.resetTitle"), text: t("settings.resetConfirm"), action: () => { updateState(() => makeInitialState()); setConfirmAction(null); setToast(t("settings.resetDone")); } })}>{t("settings.resetAction")}</button></section>
    </div>
  </div>;

  const currentXpFingerprint = questDraft ? estimateFingerprint(questDraft, language) : "";
  const estimateLocked = !!questDraft && lastEstimatedRevision === questDraftRevision && lastEstimatedFingerprint === currentXpFingerprint;
  const currentXpSuggestion = lastEstimatedFingerprint === currentXpFingerprint ? xpSuggestion : null;
  const editingQuest = !!questDraft && state.quests.some(quest => quest.id === questDraft.id);

  return <div className={`app-shell ${state.settings.animations ? "" : "reduce-motion"} ${readOnly ? "read-only" : ""}`} spellCheck={state.settings.spellcheck !== false}>
    {readOnly && <div className={`sync-banner ${syncMode}`}><span>{t("sync.banner")} <strong>READ-ONLY</strong></span><button onClick={() => setBootstrapAttempt(attempt => attempt + 1)}>{t("sync.retry")}</button></div>}
    {syncMode === "syncing" && <div className="sync-banner syncing">{t("sync.saving")}</div>}
    <aside className="sidebar">
      <button className="brand" onClick={() => setView("dashboard")}><span>W</span><div><strong>WeAscend</strong><small>PERSONAL PROGRESS SYSTEM</small></div></button>
      <nav>{views.map(item => {
        const Icon = item.icon;
        const label = t(item.labelKey);
        return <button aria-current={view === item.id ? "page" : undefined} aria-label={label} data-label={label} key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i aria-hidden="true"><Icon size={20} strokeWidth={1.9} /></i><span>{label}</span>{item.id === "quests" && activeQuests.length > 0 && <b>{activeQuests.length}</b>}</button>;
      })}</nav>
      <div className="sidebar-profile"><div>{metrics.rank}</div><span><strong>{t("profile.hunter")}</strong><small>{t("profile.level")} {metrics.progress.level} · {metrics.xp} XP</small></span></div>
      <p className={`local-status ${syncMode}`}><i /> {syncMode === "online" ? t("sync.cloudSynced") : syncMode === "syncing" ? t("sync.cloudSyncing") : t("sync.cloudReadOnly")}</p>
    </aside>
    <main className="content">
      <div className="mobile-top"><button className="brand" onClick={() => setView("dashboard")}><span>W</span><strong>WeAscend</strong></button><button onClick={beginNewQuest}>＋</button></div>
      {view === "dashboard" && Dashboard()}
      {view === "quests" && Quests()}
      {view === "growth" && Growth()}
      {view === "bosses" && Bosses()}
      {view === "history" && History()}
      {view === "settings" && SettingsView()}
    </main>
    <nav className="bottom-nav">{views.map(item => {
      const Icon = item.icon;
      const label = t(item.labelKey);
      return <button aria-current={view === item.id ? "page" : undefined} aria-label={label} key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i aria-hidden="true"><Icon size={19} strokeWidth={1.9} /></i><span>{label}</span></button>;
    })}</nav>
    {(tutorialStep !== null || (syncMode === "online" && state.settings.tutorialCompleted !== true)) && <OnboardingTutorial language={language} step={tutorialStep ?? 0} onStepChange={goToTutorialStep} onFinish={finishTutorial} />}
    {templateDraft && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setTemplateDraft(null)}>
      <section className="modal quest-modal template-modal" role="dialog" aria-modal="true" aria-label={t("template.editTitle")}>
        <header><div><p>{t("template.eyebrow")}</p><h2>{t("template.editTitle")}</h2><span>{t("template.futureOnly")}</span></div><button onClick={() => setTemplateDraft(null)} aria-label={t("common.close")}>×</button></header>
        <div className="form-grid">
          <Field label={t("editor.name")} wide><input autoFocus maxLength={500} value={templateDraft.title} onChange={event => updateTemplateDraft({ ...templateDraft, title: event.target.value })} /></Field>
          <Field label={t("editor.description")} wide><textarea maxLength={10_000} value={templateDraft.description} onChange={event => updateTemplateDraft({ ...templateDraft, description: event.target.value })} /></Field>
          <Field label={t("editor.type")}><select value={templateDraft.type} onChange={event => updateTemplateDraft({ ...templateDraft, type: event.target.value as QuestTemplate["type"] })}>{state.settings.questTypes.filter(type => type !== "Boss").map(type => <option key={type} value={type}>{t(`type.${type}` as TranslationKey)}</option>)}</select></Field>
          <Field label={t("editor.difficulty")}><select value={templateDraft.difficulty} onChange={event => updateTemplateDraft({ ...templateDraft, difficulty: event.target.value as Quest["difficulty"] })}>{(["Easy", "Normal", "Hard", "Extreme"] as const).map(difficulty => <option key={difficulty} value={difficulty}>{t(`difficulty.${difficulty}` as TranslationKey)}</option>)}</select></Field>
          <Field label={t("editor.attribute")}><select value={templateDraft.attributeId} onChange={event => { const attributeId = event.target.value; updateTemplateDraft({ ...templateDraft, attributeId, skillId: availableSkills.find(skill => skill.attributeId === attributeId)?.id ?? "" }); }}>{availableAttributes.map(attribute => <option key={attribute.id} value={attribute.id}>{attribute.name}</option>)}</select></Field>
          <Field label={t("editor.skill")}><select value={templateDraft.skillId} onChange={event => updateTemplateDraft({ ...templateDraft, skillId: event.target.value })}>{availableSkills.filter(skill => skill.attributeId === templateDraft.attributeId).map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></Field>
          <Field label={t("template.schedule")}><select value={templateDraft.schedule} onChange={event => { const schedule = event.target.value as QuestTemplate["schedule"]; updateTemplateDraft({ ...templateDraft, schedule, intervalDays: schedule === "interval" ? templateDraft.intervalDays ?? 2 : templateDraft.intervalDays, startDate: today }); }}><option value="none">{t("template.none")}</option><option value="daily">{t("template.daily")}</option><option value="weekly">{t("template.weekly")}</option><option value="interval">{t("template.interval")}</option></select></Field>
          <Field label={t("template.time")}><input type="time" value={templateDraft.time} onChange={event => updateTemplateDraft({ ...templateDraft, time: event.target.value })} /></Field>
          {templateDraft.schedule === "weekly" && <div className="field wide template-weekday-field"><span>{t("template.weekdays")}</span><div className="weekday-picker">{[1, 2, 3, 4, 5, 6, 0].map((day, index) => <button type="button" key={day} className={templateDraft.weekdays.includes(day) ? "active" : ""} onClick={() => updateTemplateDraft({ ...templateDraft, weekdays: templateDraft.weekdays.includes(day) ? templateDraft.weekdays.filter(item => item !== day) : [...templateDraft.weekdays, day] })}>{t("planner.weekdays").split(",")[index]}</button>)}</div></div>}
          {templateDraft.schedule === "interval" && <Field label={t("template.intervalDays")}><input type="number" min="2" max="365" value={templateDraft.intervalDays ?? 2} onChange={event => updateTemplateDraft({ ...templateDraft, intervalDays: Math.max(2, Math.min(365, Number(event.target.value) || 2)), startDate: today })} /></Field>}
          <Field label={t("template.deadlineMinutes")}><input type="number" min="0" max="43200" value={templateDraft.deadlineOffsetMinutes} onChange={event => updateTemplateDraft({ ...templateDraft, deadlineOffsetMinutes: Math.max(0, Number(event.target.value) || 0) })} /><small>{t("template.deadlineMinutesText")}</small></Field>
          <Field label={state.settings.manualXpOverride ? t("editor.manualReward") : t("template.futureXp")}>
            {state.settings.manualXpOverride
              ? <input type="number" min="0" value={templateDraft.xp} onChange={event => setTemplateDraft({ ...templateDraft, xp: Math.max(0, Number(event.target.value) || 0), xpSource: "manual" })} />
              : <div className="xp-score-display"><strong>{templateDraft.xp} XP</strong><span>{templateDraft.xpSource === "ai" ? "AI" : templateDraft.xpSource === "legacy" ? "EXISTING" : templateDraft.xp === 0 ? "AI PENDING" : "SYSTEM"}</span></div>}
          </Field>
          <div className="xp-advisor field wide template-xp-advisor">
            <div><span>{t("ai.optional")}</span><strong>{t("ai.title")}</strong><p>{t("template.aiText")}</p></div>
            {templateAiOffline ? <div className="ai-offline"><strong>{t("ai.offline")}</strong><span>{t("ai.offlineText")}</span></div> : <button type="button" onClick={() => void estimateTemplateXp()} disabled={templateEstimating}>{templateEstimating ? t("ai.estimating") : t("template.estimateXp")}</button>}
            {templateSuggestion && <div className="xp-suggestion"><span><b>{templateSuggestion.xp} XP</b><small>{t(`ai.confidence.${templateSuggestion.confidence}` as TranslationKey)}</small></span><p>{templateSuggestion.rationale}</p><button type="button" onClick={applyTemplateSuggestion}>{t("ai.apply")}</button></div>}
          </div>
          <Field label={t("editor.condition")} wide><input maxLength={10_000} value={templateDraft.completionConditions} onChange={event => updateTemplateDraft({ ...templateDraft, completionConditions: event.target.value })} /></Field>
          {(templateDraft.type === "Mandatory" || templateDraft.type === "Correction") && <Field label={t("editor.consequence")} wide><textarea maxLength={10_000} value={templateDraft.failureConsequence} onChange={event => updateTemplateDraft({ ...templateDraft, failureConsequence: event.target.value })} /></Field>}
        </div>
        <footer><button onClick={() => setTemplateDraft(null)}>{t("common.cancel")}</button><button className="primary" onClick={saveTemplateDraft}>{t("template.saveChanges")}</button></footer>
      </section>
    </div>}
    {questDraft && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && !questSaving && setQuestDraft(null)}>
      <section aria-busy={questSaving} className={`modal quest-modal ${questSaving ? "is-saving" : ""}`} role="dialog" aria-modal="true" aria-label={t("editor.label")}>
        <header><div><p>{t("editor.mission")}</p><h2>{editingQuest ? t("editor.edit") : t("editor.create")}</h2></div><button disabled={questSaving} onClick={() => setQuestDraft(null)} aria-label={t("common.close")}>×</button></header>
        {questDraft.id === TUTORIAL_QUEST_ID && <div className="tutorial-editor-banner"><strong>{t("tutorial.editorPreview")}</strong><span>{t("tutorial.editorPreviewText")}</span></div>}
        <div className="form-grid">
          <div className="quest-basics-group" data-tour="quest-basics">
            <Field label={t("editor.name")} wide><input autoFocus value={questDraft.title} onChange={e => updateQuestDraft({ ...questDraft, title: e.target.value })} placeholder={t("editor.namePlaceholder")} /></Field>
            <Field label={t("editor.description")} wide><textarea className="quest-description-input" rows={5} value={questDraft.description} onChange={e => updateQuestDraft({ ...questDraft, description: e.target.value })} placeholder={t("editor.descriptionPlaceholder")} /></Field>
          </div>
          <Field label={t("editor.type")}><select value={questDraft.type} onChange={e => changeQuestType(e.target.value as QuestType)}>{state.settings.questTypes.map(type => <option key={type} value={type}>{t(`type.${type}` as TranslationKey)}</option>)}</select></Field>
          <Field label={t("editor.difficulty")}><select value={questDraft.difficulty} onChange={e => updateQuestDraft({ ...questDraft, difficulty: e.target.value as Quest["difficulty"] })}>{(["Easy", "Normal", "Hard", "Extreme"] as const).map(difficulty => <option key={difficulty} value={difficulty}>{t(`difficulty.${difficulty}` as TranslationKey)}</option>)}</select></Field>
          <div className="quest-path-group" data-tour="quest-path">
            <Field label={t("editor.attribute")}><select value={questDraft.attributeId} onChange={e => { const id = e.target.value; updateQuestDraft({ ...questDraft, attributeId: id, skillId: state.skills.find(s => s.attributeId === id && !s.deletedAt)?.id ?? "" }); }}>{availableAttributes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}{questDraft.attributeId && !availableAttributes.some(a => a.id === questDraft.attributeId) && <option value={questDraft.attributeId}>{attrName(questDraft.attributeId)} ({t("status.archived")})</option>}</select></Field>
            <Field label={t("editor.skill")}><select value={questDraft.skillId} onChange={e => updateQuestDraft({ ...questDraft, skillId: e.target.value })}>{state.skills.filter(s => s.attributeId === questDraft.attributeId && (!s.deletedAt || s.id === questDraft.skillId)).map(s => <option key={s.id} value={s.id}>{s.name}{s.deletedAt ? ` (${t("quest.deletedSkill")})` : ""}</option>)}</select></Field>
          </div>
          {questDraft.type !== "Boss" && openBossQuests.length > 0 && <Field label={t("editor.preparationFor")} wide><select value={questDraft.parentQuestId ?? ""} onChange={e => updateQuestDraft({ ...questDraft, parentQuestId: e.target.value || undefined, stepOrder: e.target.value ? (questDraft.stepOrder ?? state.quests.filter(quest => quest.parentQuestId === e.target.value).length) : undefined })}><option value="">{t("editor.independentQuest")}</option>{openBossQuests.map(boss => <option key={boss.id} value={boss.id}>{boss.title}</option>)}</select><small>{t("editor.preparationForText")}</small></Field>}
          <Field label={state.settings.manualXpOverride ? t("editor.manualReward") : t("editor.calculatedReward")}>
            {state.settings.manualXpOverride
              ? <input type="number" min="0" value={questDraft.xp} onChange={e => { setQuestDraft({ ...questDraft, xp: Math.max(0, Number(e.target.value) || 0), xpSource: "manual", xpArgumentReason: undefined }); setXpSuggestion(null); setXpArgument(null); setXpAiOffline(false); }} />
              : <div className="xp-score-display"><strong>{questDraft.xp} XP</strong><span>{questDraft.xpSource === "ai" ? "AI" : questDraft.xpSource === "argument" ? "AI APPEAL" : questDraft.xpSource === "legacy" ? "EXISTING" : "AI PENDING"}</span></div>}
          </Field>
          <div className="xp-advisor field wide" data-tour="quest-xp">
            <div><span>{t("ai.optional")}</span><strong>{t("ai.title")}</strong><p>{t("ai.text")}</p></div>
            {xpAiOffline
              ? <div className="ai-offline"><strong>{t("ai.offline")}</strong><span>{t("ai.offlineText")}</span></div>
              : <button type="button" onClick={() => void estimateQuestXp()} disabled={xpEstimating || estimateLocked}>{xpEstimating ? t("ai.estimating") : estimateLocked ? t("ai.reestimate") : t("ai.estimate")}</button>}
            {currentXpSuggestion && <div className="xp-suggestion"><span><b>{currentXpSuggestion.xp} XP</b><small>{t(`ai.confidence.${currentXpSuggestion.confidence}` as TranslationKey)} · {t(`ai.decision.${currentXpSuggestion.decision ?? "estimate"}` as TranslationKey)}</small></span><p>{currentXpSuggestion.rationale}</p><div className="xp-suggestion-actions"><button type="button" onClick={applyXpSuggestion}>{t("ai.apply")}</button>{!argumentUsed && <button type="button" className="argue-button" onClick={() => { const allowed = allowedXpForCategory(currentXpSuggestion.category); const requestedXp = allowed.find(value => value > currentXpSuggestion.xp) ?? [...allowed].reverse().find(value => value < currentXpSuggestion.xp) ?? currentXpSuggestion.xp; setXpArgument({ requestedXp, reason: "" }); }}>{t("ai.argue")}</button>}</div></div>}
          </div>
          <Field label={t("editor.date")}><input type="datetime-local" required value={questDraft.date} onChange={e => updateQuestDraft({ ...questDraft, date: e.target.value })} /></Field>
          <Field label={t("editor.deadline")}><input type="datetime-local" value={questDraft.deadline} onChange={e => updateQuestDraft({ ...questDraft, deadline: e.target.value })} /></Field>
          <Field label={t("editor.condition")} tour="quest-completion" wide><input value={questDraft.completionConditions} onChange={e => updateQuestDraft({ ...questDraft, completionConditions: e.target.value })} placeholder={t("editor.conditionPlaceholder")} /></Field>
          {(questDraft.type === "Mandatory" || questDraft.type === "Correction") && <Field label={t("editor.consequence")} wide><textarea value={questDraft.failureConsequence} onChange={e => updateQuestDraft({ ...questDraft, failureConsequence: e.target.value })} placeholder={t("editor.consequencePlaceholder")} /></Field>}
        </div>
        <footer><button disabled={questSaving} onClick={() => setQuestDraft(null)}>{t("common.cancel")}</button><button className={`primary save-quest-button ${questSaving ? "saving" : ""}`} data-tour="quest-activate" disabled={questSaving} onClick={() => void saveQuest()}>{questSaving ? (editingQuest ? t("editor.savingChanges") : t("editor.activating")) : editingQuest ? t("editor.saveChanges") : t("editor.activate")}</button></footer>
      </section>
    </div>}
    {questDraft && xpSuggestion && xpArgument && <div className="modal-backdrop argument-backdrop" onMouseDown={e => e.target === e.currentTarget && setXpArgument(null)}>
      <form className="modal input-modal argument-modal" role="dialog" aria-modal="true" aria-label={t("ai.argumentTitle")} onSubmit={e => { e.preventDefault(); void argueQuestXp(); }}>
        <header><div><p>{t("ai.optional")}</p><h2>{t("ai.argumentTitle")}</h2></div><button type="button" onClick={() => setXpArgument(null)} aria-label={t("common.close")}>×</button></header>
        <div className="input-modal-body argument-body">
          <Field label={t("ai.argumentRequested")}><select value={xpArgument.requestedXp} onChange={e => setXpArgument({ ...xpArgument, requestedXp: Number(e.target.value) })}>{allowedXpForCategory(xpSuggestion.category).filter(value => value !== xpSuggestion.xp).map(value => <option key={value} value={value}>{value} XP</option>)}</select></Field>
          <Field label={t("ai.argumentReason")}><textarea autoFocus minLength={10} maxLength={800} value={xpArgument.reason} onChange={e => setXpArgument({ ...xpArgument, reason: e.target.value })} placeholder={t("ai.argumentPlaceholder")} /></Field>
        </div>
        <footer><button type="button" onClick={() => setXpArgument(null)}>{t("common.cancel")}</button><button className="primary" type="submit" disabled={xpEstimating || xpArgument.reason.trim().length < 10}>{xpEstimating ? t("ai.estimating") : t("ai.submitArgument")}</button></footer>
      </form>
    </div>}
    {stepPlanner && (() => {
      const boss = state.quests.find(quest => quest.id === stepPlanner.bossId);
      if (!boss) return null;
      const selectedCount = stepPlanner.steps.filter(step => step.selected).length;
      return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setStepPlanner(null)}>
        <form className="modal step-planner-modal" role="dialog" aria-modal="true" aria-label={t("boss.generatorTitle")} onSubmit={e => {
          e.preventDefault();
          if (stepPlanner.steps.length) void createGeneratedBossSteps();
          else void generateBossSteps();
        }}>
          <header><div><p>{t("boss.generatorEyebrow")}</p><h2>{t("boss.generatorTitle")}</h2><span>{boss.title}</span></div><button type="button" onClick={() => setStepPlanner(null)} aria-label={t("common.close")}>×</button></header>
          <div className="step-planner-body">
            {stepPlanner.steps.length === 0
              ? <>
                <Field label={t("boss.generatorInstruction")}><textarea autoFocus rows={5} maxLength={1_000} value={stepPlanner.instruction} onChange={e => setStepPlanner({ ...stepPlanner, instruction: e.target.value, offline: false })} placeholder={t("boss.generatorPlaceholder")} /></Field>
                <p className="step-planner-note">{t("boss.generatorPrivacy")}</p>
                {stepPlanner.offline && <div className="ai-offline"><strong>{t("ai.offline")}</strong><span>{t("boss.generatorOffline")}</span></div>}
              </>
              : <>
                <div className="step-planner-summary"><span>{t("boss.generatorPreview")}</span><strong>{t("boss.generatorSelected", { count: selectedCount })}</strong></div>
                <div className="generated-step-list">{stepPlanner.steps.map((step, index) => <article key={step.id} className={step.selected ? "" : "excluded"}>
                  <label className="generated-step-select"><input type="checkbox" checked={step.selected} onChange={e => updateGeneratedBossStep(step.id, { selected: e.target.checked })} /><span>{String(index + 1).padStart(2, "0")}</span></label>
                  <div className="generated-step-fields">
                    <input aria-label={t("boss.generatedTitle")} maxLength={180} value={step.title} onChange={e => updateGeneratedBossStep(step.id, { title: e.target.value })} />
                    <textarea aria-label={t("boss.generatedDescription")} rows={2} maxLength={1_500} value={step.description} onChange={e => updateGeneratedBossStep(step.id, { description: e.target.value })} />
                    <div><input aria-label={t("boss.generatedDate")} type="date" value={step.date} onChange={e => updateGeneratedBossStep(step.id, { date: e.target.value })} /><input aria-label={t("boss.generatedCondition")} maxLength={500} value={step.completionConditions} onChange={e => updateGeneratedBossStep(step.id, { completionConditions: e.target.value })} /></div>
                    <small>{step.rationale}</small>
                  </div>
                  <strong>{step.xp} XP</strong>
                </article>)}</div>
              </>}
          </div>
          <footer>
            <button type="button" onClick={() => setStepPlanner(null)}>{t("common.cancel")}</button>
            {stepPlanner.steps.length > 0 && <button type="button" onClick={() => setStepPlanner({ ...stepPlanner, offline: false, steps: [] })}>{t("boss.generatorBack")}</button>}
            <button className="primary" type="submit" disabled={stepPlanner.loading || (!stepPlanner.steps.length && stepPlanner.instruction.trim().length < 3) || (stepPlanner.steps.length > 0 && selectedCount === 0)}>
              {stepPlanner.loading ? t("boss.generating") : stepPlanner.steps.length ? t("boss.createGenerated", { count: selectedCount }) : t("boss.generate")}
            </button>
          </footer>
        </form>
      </div>;
    })()}
    {inputDialog && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setInputDialog(null)}>
      <form className={`modal input-modal ${inputDialog.compact ? "note-modal" : ""}`} role="dialog" aria-modal="true" aria-label={inputDialog.title} onSubmit={e => {
        e.preventDefault();
        if (inputDialog.required && !inputDialog.value.trim()) {
          setToast(t("common.required"));
          return;
        }
        const action = inputDialog.action;
        const value = inputDialog.value;
        setInputDialog(null);
        action(value);
      }}>
        <header><div><p>{t("editor.systemInput")}</p><h2>{inputDialog.title}</h2></div><button type="button" onClick={() => setInputDialog(null)} aria-label={t("common.close")}>×</button></header>
        <div className="input-modal-body">{inputDialog.description && <p className="input-dialog-description">{inputDialog.description}</p>}<Field label={inputDialog.label}>{inputDialog.multiline
          ? <textarea autoFocus rows={5} maxLength={inputDialog.maxLength} value={inputDialog.value} onChange={e => setInputDialog({ ...inputDialog, value: e.target.value })} placeholder={inputDialog.placeholder} />
          : <input autoFocus autoComplete={inputDialog.inputType === "password" ? "current-password" : undefined} type={inputDialog.inputType ?? "text"} maxLength={inputDialog.maxLength} value={inputDialog.value} onChange={e => setInputDialog({ ...inputDialog, value: e.target.value })} placeholder={inputDialog.placeholder} />
        }</Field></div>
        <footer>{inputDialog.clearAction && <button className="note-clear" type="button" onClick={() => { const clear = inputDialog.clearAction; setInputDialog(null); clear?.(); }}>{inputDialog.clearLabel}</button>}<button type="button" onClick={() => setInputDialog(null)}>{t("common.cancel")}</button><button className={inputDialog.danger ? "danger" : "primary"} type="submit">{inputDialog.submitLabel}</button></footer>
      </form>
    </div>}
    {ceremony && <div className="modal-backdrop ceremony-backdrop"><section className="ceremony modal"><div className="ceremony-glyph">✦</div><p>{ceremony.eyebrow}</p><h2>{ceremony.title}</h2><span>{ceremony.text}</span><button className="primary" onClick={() => setCeremony(null)}>{t("common.continue")}</button></section></div>}
    {confirmAction && <div className="modal-backdrop"><section className="modal confirm-modal"><div className="warning-mark">!</div><h2>{confirmAction.title}</h2><p>{confirmAction.text}</p><footer><button onClick={() => setConfirmAction(null)}>{t("common.cancel")}</button><button className="danger" onClick={confirmAction.action}>{t("common.confirm")}</button></footer></section></div>}
    {motionCue?.kind === "complete" && motionCue.xp && <div className="xp-float" key={motionCue.key} aria-hidden="true">+{motionCue.xp} XP</div>}
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </div>;
}
