"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { activeXp, canAwardQuest, deleteAttributeFromState, deleteQuestFromState, isUntouchedDemoState, isValidBackup, isValidCloudState, makeInitialState, nextRecurringInstance, progressFromXp, rankForLevel, type AppState, type Quest, type QuestType, type XpTransaction } from "./domain";
import { loadState, saveState } from "./db";
import { translate, type Language, type TranslationKey } from "./i18n";
import type { XpSuggestion } from "./xpAdvisor";

type View = "dashboard" | "quests" | "growth" | "bosses" | "history" | "settings";
type SyncMode = "starting" | "online" | "syncing" | "offline" | "local";
type CloudStateResponse = {
  state: AppState | null;
  revision: number;
  updatedAt?: string | null;
  user?: { email: string; name: string };
  code?: string;
};
const views: { id: View; labelKey: TranslationKey; icon: string }[] = [
  { id: "dashboard", labelKey: "nav.command", icon: "◇" },
  { id: "quests", labelKey: "nav.quests", icon: "✦" },
  { id: "growth", labelKey: "nav.growth", icon: "⌁" },
  { id: "bosses", labelKey: "nav.bosses", icon: "⬡" },
  { id: "history", labelKey: "nav.history", icon: "◫" },
  { id: "settings", labelKey: "nav.settings", icon: "⚙" },
];

const blankQuest = (state: AppState): Quest => {
  const now = new Date();
  const deadline = new Date(now.getTime() + 3600000);
  const skill = state.skills.find(s => !s.deletedAt && state.attributes.some(a => a.id === s.attributeId && !a.deletedAt));
  const attribute = state.attributes.find(a => a.id === skill?.attributeId && !a.deletedAt);
  return {
    id: crypto.randomUUID(), title: "", description: "", type: "Side",
    attributeId: attribute?.id ?? "", skillId: skill?.id ?? "", xp: 10,
    date: now.toISOString(), deadline: deadline.toISOString(), recurrence: "none",
    difficulty: "Normal", completionConditions: "", failureConsequence: "",
    status: "active", createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
};

const isoLocal = (value: string) => value ? new Date(value).toISOString().slice(0, 16) : "";
const fromLocal = (value: string) => value ? new Date(value).toISOString() : "";
const dayKey = (value: string | Date) => new Date(value).toLocaleDateString("sv-SE");
const today = dayKey(new Date());
const LANGUAGE_EVENT = "wesolo-language-change";
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

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`field ${wide ? "wide" : ""}`}><span>{label}</span>{children}</label>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><span>◇</span><strong>{title}</strong><p>{text}</p></div>;
}

function hasUserData(state: AppState) {
  return state.attributes.length > 0 || state.skills.length > 0 || state.quests.length > 0 ||
    state.transactions.length > 0 || state.bosses.length > 0 || state.levelEvents.length > 0;
}

async function cloudFetch(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function SoloApp() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguageSnapshot, getServerLanguageSnapshot);
  const [state, setState] = useState<AppState | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>("starting");
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [cloudUser, setCloudUser] = useState<{ email: string; name: string } | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [questDraft, setQuestDraft] = useState<Quest | null>(null);
  const [xpSuggestion, setXpSuggestion] = useState<XpSuggestion | null>(null);
  const [xpEstimating, setXpEstimating] = useState(false);
  const [toast, setToast] = useState("");
  const [ceremony, setCeremony] = useState<{ eyebrow: string; title: string; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; text: string; action: () => void } | null>(null);
  const [inputDialog, setInputDialog] = useState<{
    title: string;
    label: string;
    value: string;
    placeholder?: string;
    submitLabel: string;
    multiline?: boolean;
    required?: boolean;
    maxLength?: number;
    compact?: boolean;
    clearLabel?: string;
    clearAction?: () => void;
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
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncModeRef = useRef<SyncMode>("starting");
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
      const saved = await loadState().catch(() => null);
      const local = saved && isValidBackup(saved) && !isUntouchedDemoState(saved) ? saved : makeInitialState();

      try {
        const response = await cloudFetch("/api/state", { cache: "no-store", credentials: "same-origin" });
        const cloud = await response.json() as CloudStateResponse;
        if (cancelled) return;

        if (response.status === 401) {
          setAuthRequired(true);
          setAccessDenied(false);
          setMode("offline");
          return;
        }
        if (response.status === 403 && cloud.code === "owner_access_denied") {
          setAuthRequired(false);
          setAccessDenied(true);
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
        setAccessDenied(false);
        setCloudUser(cloud.user ?? null);
        revisionRef.current = cloud.revision;
        let selected = cloud.state && isValidCloudState(cloud.state) ? cloud.state : null;

        if (!selected && hasUserData(local)) {
          const migration = await cloudFetch("/api/state", {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: local, revision: cloud.revision }),
          });
          const migrated = await migration.json() as CloudStateResponse;
          if (migration.ok && migrated.state && isValidCloudState(migrated.state)) {
            selected = migrated.state;
            revisionRef.current = migrated.revision;
          } else if (migration.status === 409 && migrated.state && isValidCloudState(migrated.state)) {
            selected = migrated.state;
            revisionRef.current = migrated.revision;
          }
        }

        selected ??= makeInitialState();
        lastSyncedRef.current = JSON.stringify(selected);
        pendingStateRef.current = selected;
        hydratedRef.current = true;
        localStorage.setItem("wesolo-cloud-enabled", "1");
        setMode("online");
        setState(selected);
        void saveState(selected);
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

      if (response.status === 401 || (response.status === 403 && result.code === "owner_access_denied")) {
        const confirmed = lastSyncedRef.current;
        if (confirmed) {
          const restored: unknown = JSON.parse(confirmed);
          if (isValidCloudState(restored)) {
            pendingStateRef.current = restored;
            setState(restored);
            void saveState(restored);
          }
        }
        setAuthRequired(response.status === 401);
        setAccessDenied(response.status === 403);
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
            void saveState(restored);
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
    saveState(state).catch(() => setToast(translate(language, "sync.cacheFailed")));
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

  const metrics = useMemo(() => {
    if (!state) return null;
    const xp = activeXp(state.transactions);
    const progress = progressFromXp(xp, state.settings);
    return { xp, progress, rank: rankForLevel(progress.level, state.settings.ranks) };
  }, [state]);

  if (accessDenied) return <main className="auth-gate auth-denied"><div className="auth-mark">W</div><p>{t("auth.deniedCloud")}</p><h1>{t("auth.deniedTitle")}</h1><span>{t("auth.deniedText")}</span><a href="/signout-with-chatgpt?return_to=%2F">{t("auth.deniedAction")}</a></main>;
  if (authRequired) return <main className="auth-gate"><div className="auth-mark">W</div><p>{t("auth.cloud")}</p><h1>{t("auth.title")}</h1><span>{t("auth.text")}</span><a href="/signin-with-chatgpt?return_to=%2F">{t("auth.action")}</a></main>;
  if (!state || !metrics) return <main className="loading"><div className="loader-mark">W</div><p>{t("loading")}</p></main>;

  const readOnly = syncMode === "offline" || syncMode === "local";
  const ensureWritable = () => {
    if (!readOnly) return true;
    setToast(t("sync.readOnlyToast"));
    return false;
  };
  const updateState = (recipe: (current: AppState) => AppState) => {
    if (!ensureWritable()) return false;
    setState(current => current ? recipe(current) : current);
    return true;
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
  const todayQuests = activeQuests.filter(q => dayKey(q.date) === today);
  const mainQuest = todayQuests.find(q => q.type === "Main") ?? activeQuests.find(q => q.type === "Main");

  const completeQuest = (quest: Quest) => {
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
    const next = nextRecurringInstance(quest);
    const nextTransactions = transaction ? [...state.transactions, transaction] : state.transactions;
    const after = progressFromXp(activeXp(nextTransactions), state.settings);
    const newRank = rankForLevel(after.level, state.settings.ranks);
    updateState(s => ({
      ...s,
      quests: [...s.quests.map(q => q.id === quest.id ? { ...q, status: "completed" as const, completedAt: stamp, updatedAt: stamp } : q), ...(next ? [next] : [])],
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
    if (!ensureWritable()) return;
    updateState(s => ({ ...s, quests: s.quests.map(q => q.id === quest.id ? { ...q, status: "failed", updatedAt: new Date().toISOString() } : q) }));
    if (quest.type === "Mandatory" && quest.failureConsequence) {
      setCeremony({ eyebrow: t("ceremony.mandatoryFailed"), title: t("ceremony.consequenceActive"), text: quest.failureConsequence });
    } else setToast(t("quest.failedZero"));
  };

  const undoQuest = (quest: Quest) => {
    if (!ensureWritable()) return;
    const stamp = new Date().toISOString();
    updateState(s => ({
      ...s,
      quests: s.quests.map(q => q.id === quest.id ? { ...q, status: "active", completedAt: undefined, updatedAt: stamp } : q),
      transactions: s.transactions.map(tx => tx.questId === quest.id && !tx.reversedAt ? { ...tx, reversedAt: stamp } : tx),
    }));
    setToast(t("quest.undoDone"));
  };

  const saveQuest = () => {
    if (!ensureWritable()) return;
    if (!questDraft?.title.trim()) { setToast(t("quest.enterName")); return; }
    if (!questDraft.attributeId || !questDraft.skillId) { setToast(t("quest.choosePath")); return; }
    const exists = state.quests.some(q => q.id === questDraft.id);
    const updated = {
      ...questDraft,
      note: questDraft.note?.trim().slice(0, 500) || undefined,
      updatedAt: new Date().toISOString(),
      xp: Math.max(0, Number(questDraft.xp) || 0),
    };
    updateState(s => ({ ...s, quests: exists ? s.quests.map(q => q.id === updated.id ? updated : q) : [updated, ...s.quests] }));
    setQuestDraft(null);
    setToast(exists ? t("quest.updated") : t("quest.created"));
  };

  const updateQuestDraft = (next: Quest) => {
    setQuestDraft(next);
    setXpSuggestion(null);
  };

  const estimateQuestXp = async () => {
    if (!questDraft || !ensureWritable()) return;
    if (!questDraft.title.trim()) {
      setToast(t("quest.enterBeforeAi"));
      return;
    }

    setXpEstimating(true);
    setXpSuggestion(null);
    try {
      const response = await cloudFetch("/api/xp-estimate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: questDraft.title,
          description: questDraft.description,
          type: questDraft.type,
          difficulty: questDraft.difficulty,
          attribute: attrName(questDraft.attributeId),
          skill: skillName(questDraft.skillId),
          completionConditions: questDraft.completionConditions,
          language,
        }),
      }, 22_000);
      const result = await response.json() as { suggestion?: XpSuggestion; code?: string };

      if (!response.ok || !result.suggestion) {
        const messages: Record<string, string> = {
          ai_not_configured: t("ai.notConfigured"),
          ai_auth_failed: t("ai.authFailed"),
          ai_balance_empty: t("ai.balanceEmpty"),
          ai_rate_limited: t("ai.rateLimited"),
          ai_timeout: t("ai.timeout"),
        };
        setToast(messages[result.code ?? ""] ?? t("ai.unavailable"));
        return;
      }

      setXpSuggestion(result.suggestion);
    } catch {
      setToast(t("ai.unavailable"));
    } finally {
      setXpEstimating(false);
    }
  };

  const deleteQuest = (quest: Quest) => {
    if (!ensureWritable()) return;
    setConfirmAction({
      title: t("quest.deleteTitle"),
      text: t("quest.deleteText"),
      action: () => { updateState(s => deleteQuestFromState(s, quest.id)); setConfirmAction(null); setToast(t("quest.deleted")); },
    });
  };

  const saveQuestNote = (questId: string, value: string) => {
    const note = value.trim().slice(0, 500);
    const stamp = new Date().toISOString();
    updateState(s => ({
      ...s,
      quests: s.quests.map(quest => quest.id === questId
        ? { ...quest, note: note || undefined, updatedAt: stamp }
        : quest),
    }));
    setToast(note ? t("quest.noteSaved") : t("quest.noteRemoved"));
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
    setXpSuggestion(null);
    setQuestDraft({
      ...draft,
      type,
      xp: type === "Boss" ? 100 : draft.xp,
      difficulty: type === "Boss" ? "Hard" : draft.difficulty,
      date: date.toISOString(),
      deadline: deadline.toISOString(),
    });
  };
  const beginNewQuest = () => beginQuestOnDate(today);
  const beginBossQuest = () => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    beginQuestOnDate(dayKey(date), "Boss");
  };
  const shiftCalendarMonth = (amount: number) => {
    const date = new Date(`${calendarMonth}T12:00:00`);
    date.setMonth(date.getMonth() + amount);
    setCalendarMonth(`${dayKey(date).slice(0, 7)}-01`);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `wesolo-backup-${today}.json`;
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
    (filters.status === "all" || q.status === filters.status) &&
    (filters.attribute === "all" || q.attributeId === filters.attribute) &&
    (!filters.search || `${q.title} ${q.description} ${q.note ?? ""}`.toLowerCase().includes(filters.search.toLowerCase()))
  ).sort((a, b) => a.date.localeCompare(b.date));

  const renderQuestCard = (quest: Quest, compact = false) => (
    <article className={`quest-card ${quest.status} ${compact ? "compact" : ""}`} key={quest.id}>
      <div className="quest-accent" style={{ background: attrColor(quest.attributeId) }} />
      <div className="quest-card-main">
        <div className="quest-meta">
          <span className={`type-badge type-${quest.type.toLowerCase()}`}>{t(`type.${quest.type}` as TranslationKey)}</span>
          <span>{attrName(quest.attributeId)} / {skillName(quest.skillId)}</span>
        </div>
        <h3>{quest.title}</h3>
        {!compact && quest.description && <p>{quest.description}</p>}
        {quest.note && <button className="quest-note-preview" onClick={() => openQuestNote(quest)} aria-label={t("quest.noteEditLabel", { name: quest.title })}><span>✎</span><em>{quest.note}</em></button>}
        <div className="quest-footer">
          <span>◷ {formatDate(quest.deadline)}</span>
          <span className="xp-reward">+{quest.xp} XP</span>
          <span className="difficulty">{t(`difficulty.${quest.difficulty}` as TranslationKey)}</span>
        </div>
      </div>
      <div className="quest-actions">
        {quest.status === "active" && <>
          <button className="complete" onClick={() => completeQuest(quest)} aria-label={t("quest.completeLabel", { name: quest.title })}>✓</button>
          <button onClick={() => failQuest(quest)} aria-label={t("quest.failLabel", { name: quest.title })}>×</button>
        </>}
        {quest.status === "completed" && <button onClick={() => undoQuest(quest)}>{t("common.undo")}</button>}
        <button className={quest.note ? "has-note" : ""} onClick={() => openQuestNote(quest)} aria-label={t("quest.noteEditLabel", { name: quest.title })} title={t("quest.note")}>{compact ? "✎" : t("quest.note")}</button>
        {!compact && <>
          <button onClick={() => { if (ensureWritable()) { setXpSuggestion(null); setQuestDraft({ ...quest }); } }}>{t("common.edit")}</button>
          <button onClick={() => updateState(s => ({ ...s, quests: s.quests.map(q => q.id === quest.id ? { ...q, status: "archived" } : q) }))}>{t("common.archive")}</button>
          <button className="danger-link" onClick={() => deleteQuest(quest)}>{t("common.delete")}</button>
        </>}
      </div>
    </article>
  );

  const Dashboard = () => {
    const recent = [...state.transactions].filter(tx => !tx.reversedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
    return <div className="screen dashboard-screen">
      <section className="hero">
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
    <header className="screen-header"><div><p>{t("planner.control")}</p><h1>{t("planner.title")}</h1><span>{t("planner.summary", { active: activeQuests.length, cleared: state.quests.filter(q => q.status === "completed").length })}</span></div><button className="primary" onClick={() => beginQuestOnDate(selectedDate)}>{t("planner.planQuest")}</button></header>
    <section className="planner">
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
    <header className="screen-header"><div><p>{t("growth.matrix")}</p><h1>{t("growth.title")}</h1><span>{t("growth.subtitle")}</span></div><button className="primary" onClick={addAttribute}>{t("growth.addAttribute")}</button></header>
    <div className="attribute-grid">{availableAttributes.length === 0 && <Empty title={t("growth.empty")} text={t("growth.emptyText")} />}{availableAttributes.map(attr => {
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
      .sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || a.date.localeCompare(b.date));
    const editBoss = (quest: Quest) => {
      if (!ensureWritable()) return;
      setXpSuggestion(null);
      setQuestDraft({ ...quest });
    };
    return <div className="screen">
      <header className="screen-header"><div><p>{t("boss.gate")}</p><h1>{t("boss.title")}</h1><span>{t("boss.subtitle")}</span></div><button className="primary" onClick={beginBossQuest}>{t("boss.add")}</button></header>
      <div className="boss-grid">{bossQuests.length === 0 && <Empty title={t("boss.empty")} text={t("boss.emptyText")} />}{bossQuests.map(boss => (
        <article className={`boss-card ${boss.status}`} key={boss.id}>
          <div className="boss-visual"><span>{boss.status === "completed" ? t("boss.cleared") : boss.status === "failed" ? t("common.failed") : t("boss.gateOpen")}</span><strong>⬡</strong><p>{formatDate(boss.date, false)}</p></div>
          <div className="boss-content">
            <div className="quest-meta"><span className="type-badge type-boss">BOSS</span><span>{attrName(boss.attributeId)} / {skillName(boss.skillId)}</span></div>
            <h2>{boss.title}</h2>
            <dl>
              <div><dt>{t("boss.entry")}</dt><dd>{boss.description || t("boss.noGate")}</dd></div>
              <div><dt>{t("boss.clearCondition")}</dt><dd>{boss.completionConditions || t("boss.defaultClear")}</dd></div>
              <div><dt>{t("boss.preparation")}</dt><dd>{formatDate(boss.deadline)}</dd></div>
            </dl>
            <footer>
              <strong>+{boss.xp} XP</strong>
              <div>
                {boss.status === "active" && <><button className="complete-text" onClick={() => completeQuest(boss)}>Boss Clear</button><button onClick={() => failQuest(boss)}>{t("common.failed")}</button></>}
                {boss.status === "completed" && <button onClick={() => undoQuest(boss)}>{t("common.undo")}</button>}
                <button onClick={() => editBoss(boss)}>{t("common.edit")}</button>
              </div>
            </footer>
          </div>
        </article>
      ))}</div>
    </div>;
  };

  const History = () => {
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); return d; });
    const dayValues = days.map(d => activeXp(state.transactions.filter(tx => dayKey(tx.createdAt) === dayKey(d))));
    const maxDay = Math.max(...dayValues, 1);
    const byAttribute = state.attributes.map(attr => ({ ...attr, xp: activeXp(state.transactions.filter(tx => tx.attributeId === attr.id)) }));
    return <div className="screen">
      <header className="screen-header"><div><p>{t("history.chronicle")}</p><h1>{t("history.title")}</h1><span>{t("history.subtitle")}</span></div></header>
      <div className="stats-top"><div><span>{t("history.totalXp")}</span><strong>{metrics.xp}</strong></div><div><span>{t("history.thisWeek")}</span><strong>{activeXp(state.transactions.filter(tx => Date.now() - new Date(tx.createdAt).getTime() < 7 * 86400000))}</strong></div><div><span>{t("history.clearRate")}</span><strong>{state.quests.length ? Math.round(state.quests.filter(q => q.status === "completed").length / state.quests.length * 100) : 0}%</strong></div><div><span>{t("history.currentRank")}</span><strong>{metrics.rank}</strong></div></div>
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
      <section className="settings-card cloud-card"><header><i>↻</i><div><h2>{t("settings.cloud")}</h2><p>{t("settings.cloudText")}</p></div></header><div className="cloud-status-row"><span className={`sync-dot ${syncMode}`} /><div><strong>{syncMode === "online" ? t("settings.synced") : syncMode === "syncing" ? t("settings.saving") : syncMode === "offline" ? t("settings.disconnected") : t("settings.notConnected")}</strong><small>{cloudUser?.email ?? (syncMode === "local" ? t("settings.localMode") : "WeSolo Cloud")}</small></div>{cloudUser && <a href="/signout-with-chatgpt?return_to=%2F">{t("settings.signOut")}</a>}</div></section>
      <section className="settings-card"><header><i>ƒ</i><div><h2>{t("settings.formula")}</h2><p>{t("settings.formulaText")}</p></div></header><div className="settings-row"><Field label={t("settings.baseXp")}><input type="number" min="1" value={state.settings.baseXp} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, baseXp: Math.max(1, Number(e.target.value)) } }))} /></Field><Field label={t("settings.growth")}><input type="number" min="0" value={state.settings.levelGrowth} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, levelGrowth: Math.max(0, Number(e.target.value)) } }))} /></Field></div></section>
      <section className="settings-card"><header><i>R</i><div><h2>{t("settings.ranks")}</h2><p>{t("settings.ranksText")}</p></div></header><div className="rank-settings">{state.settings.ranks.map((rank, index) => <Field label={`${rank.name}-Rank`} key={rank.name}><input type="number" min="1" value={rank.minLevel} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, ranks: s.settings.ranks.map((r, i) => i === index ? { ...r, minLevel: Math.max(1, Number(e.target.value)) } : r) } }))} /></Field>)}</div></section>
      <section className="settings-card"><header><i>◈</i><div><h2>{t("settings.rules")}</h2><p>{t("settings.rulesText")}</p></div></header><label className="toggle-row"><div><strong>{t("settings.dailyRepeat")}</strong><span>{t("settings.dailyRepeatText")}</span></div><input type="checkbox" checked={state.settings.dailyRepeatLimit} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, dailyRepeatLimit: e.target.checked } }))} /></label><label className="toggle-row"><div><strong>{t("settings.animations")}</strong><span>{t("settings.animationsText")}</span></div><input type="checkbox" checked={state.settings.animations} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, animations: e.target.checked } }))} /></label></section>
      <section className="settings-card"><header><i>⇅</i><div><h2>{t("settings.backup")}</h2><p>{t("settings.backupText")}</p></div></header><div className="button-row"><button className="primary" onClick={exportJson}>{t("settings.export")}</button><button onClick={() => importRef.current?.click()}>{t("settings.import")}</button><input ref={importRef} hidden type="file" accept="application/json" onChange={e => e.target.files?.[0] && importJson(e.target.files[0])} /></div></section>
      <section className="settings-card danger-zone"><header><i>!</i><div><h2>{t("settings.reset")}</h2><p>{t("settings.resetText")}</p></div></header><button onClick={() => ensureWritable() && setConfirmAction({ title: t("settings.resetTitle"), text: t("settings.resetConfirm"), action: () => { updateState(() => makeInitialState()); setConfirmAction(null); setToast(t("settings.resetDone")); } })}>{t("settings.resetAction")}</button></section>
    </div>
  </div>;

  return <div className={`app-shell ${state.settings.animations ? "" : "reduce-motion"} ${readOnly ? "read-only" : ""}`}>
    {readOnly && <div className={`sync-banner ${syncMode}`}><span>{t("sync.banner")} <strong>READ-ONLY</strong></span><button onClick={() => setBootstrapAttempt(attempt => attempt + 1)}>{t("sync.retry")}</button></div>}
    {syncMode === "syncing" && <div className="sync-banner syncing">{t("sync.saving")}</div>}
    <aside className="sidebar">
      <button className="brand" onClick={() => setView("dashboard")}><span>W</span><div><strong>WeSolo</strong><small>PERSONAL PROGRESS SYSTEM</small></div></button>
      <nav>{views.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i>{item.icon}</i><span>{t(item.labelKey)}</span>{item.id === "quests" && activeQuests.length > 0 && <b>{activeQuests.length}</b>}</button>)}</nav>
      <div className="sidebar-profile"><div>{metrics.rank}</div><span><strong>{t("profile.hunter")}</strong><small>{t("profile.level")} {metrics.progress.level} · {metrics.xp} XP</small></span></div>
      <p className={`local-status ${syncMode}`}><i /> {syncMode === "online" ? t("sync.cloudSynced") : syncMode === "syncing" ? t("sync.cloudSyncing") : t("sync.cloudReadOnly")}</p>
    </aside>
    <main className="content">
      <div className="mobile-top"><button className="brand" onClick={() => setView("dashboard")}><span>W</span><strong>WeSolo</strong></button><button onClick={beginNewQuest}>＋</button></div>
      {view === "dashboard" && Dashboard()}
      {view === "quests" && Quests()}
      {view === "growth" && Growth()}
      {view === "bosses" && Bosses()}
      {view === "history" && History()}
      {view === "settings" && SettingsView()}
    </main>
    <nav className="bottom-nav">{views.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i>{item.icon}</i><span>{t(item.labelKey)}</span></button>)}</nav>
    {questDraft && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setQuestDraft(null)}>
      <section className="modal quest-modal" role="dialog" aria-modal="true" aria-label={t("editor.label")}>
        <header><div><p>{t("editor.mission")}</p><h2>{state.quests.some(q => q.id === questDraft.id) ? t("editor.edit") : t("editor.create")}</h2></div><button onClick={() => setQuestDraft(null)} aria-label={t("common.close")}>×</button></header>
        <div className="form-grid">
          <Field label={t("editor.name")} wide><input autoFocus value={questDraft.title} onChange={e => updateQuestDraft({ ...questDraft, title: e.target.value })} placeholder={t("editor.namePlaceholder")} /></Field>
          <Field label={t("editor.description")} wide><textarea value={questDraft.description} onChange={e => updateQuestDraft({ ...questDraft, description: e.target.value })} placeholder={t("editor.descriptionPlaceholder")} /></Field>
          <Field label={t("editor.type")}><select value={questDraft.type} onChange={e => updateQuestDraft({ ...questDraft, type: e.target.value as QuestType })}>{state.settings.questTypes.map(type => <option key={type} value={type}>{t(`type.${type}` as TranslationKey)}</option>)}</select></Field>
          <Field label={t("editor.difficulty")}><select value={questDraft.difficulty} onChange={e => updateQuestDraft({ ...questDraft, difficulty: e.target.value as Quest["difficulty"] })}>{(["Easy", "Normal", "Hard", "Extreme"] as const).map(difficulty => <option key={difficulty} value={difficulty}>{t(`difficulty.${difficulty}` as TranslationKey)}</option>)}</select></Field>
          <Field label={t("editor.attribute")}><select value={questDraft.attributeId} onChange={e => { const id = e.target.value; updateQuestDraft({ ...questDraft, attributeId: id, skillId: state.skills.find(s => s.attributeId === id && !s.deletedAt)?.id ?? "" }); }}>{availableAttributes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}{questDraft.attributeId && !availableAttributes.some(a => a.id === questDraft.attributeId) && <option value={questDraft.attributeId}>{attrName(questDraft.attributeId)} ({t("status.archived")})</option>}</select></Field>
          <Field label={t("editor.skill")}><select value={questDraft.skillId} onChange={e => updateQuestDraft({ ...questDraft, skillId: e.target.value })}>{state.skills.filter(s => s.attributeId === questDraft.attributeId && (!s.deletedAt || s.id === questDraft.skillId)).map(s => <option key={s.id} value={s.id}>{s.name}{s.deletedAt ? ` (${t("quest.deletedSkill")})` : ""}</option>)}</select></Field>
          <Field label={t("editor.reward")}><input type="number" min="0" value={questDraft.xp} onChange={e => updateQuestDraft({ ...questDraft, xp: Number(e.target.value) })} /></Field>
          <Field label={t("editor.recurrence")}><select value={questDraft.recurrence} onChange={e => updateQuestDraft({ ...questDraft, recurrence: e.target.value as Quest["recurrence"] })}><option value="none">{t("editor.none")}</option><option value="daily">{t("editor.daily")}</option><option value="weekly">{t("editor.weekly")}</option></select></Field>
          <div className="xp-advisor field wide">
            <div><span>{t("ai.optional")}</span><strong>{t("ai.title")}</strong><p>{t("ai.text")}</p></div>
            <button type="button" onClick={() => void estimateQuestXp()} disabled={xpEstimating}>{xpEstimating ? t("ai.estimating") : t("ai.estimate")}</button>
            {xpSuggestion && <div className="xp-suggestion"><span><b>{xpSuggestion.xp} XP</b><small>{t(`ai.confidence.${xpSuggestion.confidence}` as TranslationKey)}</small></span><p>{xpSuggestion.rationale}</p><button type="button" onClick={() => { setQuestDraft({ ...questDraft, xp: xpSuggestion.xp }); setXpSuggestion(null); }}>{t("ai.apply")}</button></div>}
          </div>
          <Field label={t("editor.date")}><input type="datetime-local" value={isoLocal(questDraft.date)} onChange={e => updateQuestDraft({ ...questDraft, date: fromLocal(e.target.value) })} /></Field>
          <Field label={t("editor.deadline")}><input type="datetime-local" value={isoLocal(questDraft.deadline)} onChange={e => updateQuestDraft({ ...questDraft, deadline: fromLocal(e.target.value) })} /></Field>
          <Field label={t("editor.condition")} wide><input value={questDraft.completionConditions} onChange={e => updateQuestDraft({ ...questDraft, completionConditions: e.target.value })} placeholder={t("editor.conditionPlaceholder")} /></Field>
          {(questDraft.type === "Mandatory" || questDraft.type === "Correction") && <Field label={t("editor.consequence")} wide><textarea value={questDraft.failureConsequence} onChange={e => updateQuestDraft({ ...questDraft, failureConsequence: e.target.value })} placeholder={t("editor.consequencePlaceholder")} /></Field>}
        </div>
        <footer><button onClick={() => setQuestDraft(null)}>{t("common.cancel")}</button><button className="primary" onClick={saveQuest}>{t("editor.activate")}</button></footer>
      </section>
    </div>}
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
        <div className="input-modal-body"><Field label={inputDialog.label}>{inputDialog.multiline
          ? <textarea autoFocus rows={5} maxLength={inputDialog.maxLength} value={inputDialog.value} onChange={e => setInputDialog({ ...inputDialog, value: e.target.value })} placeholder={inputDialog.placeholder} />
          : <input autoFocus maxLength={inputDialog.maxLength} value={inputDialog.value} onChange={e => setInputDialog({ ...inputDialog, value: e.target.value })} placeholder={inputDialog.placeholder} />
        }</Field></div>
        <footer>{inputDialog.clearAction && <button className="note-clear" type="button" onClick={() => { const clear = inputDialog.clearAction; setInputDialog(null); clear?.(); }}>{inputDialog.clearLabel}</button>}<button type="button" onClick={() => setInputDialog(null)}>{t("common.cancel")}</button><button className="primary" type="submit">{inputDialog.submitLabel}</button></footer>
      </form>
    </div>}
    {ceremony && <div className="modal-backdrop ceremony-backdrop"><section className="ceremony modal"><div className="ceremony-glyph">✦</div><p>{ceremony.eyebrow}</p><h2>{ceremony.title}</h2><span>{ceremony.text}</span><button className="primary" onClick={() => setCeremony(null)}>{t("common.continue")}</button></section></div>}
    {confirmAction && <div className="modal-backdrop"><section className="modal confirm-modal"><div className="warning-mark">!</div><h2>{confirmAction.title}</h2><p>{confirmAction.text}</p><footer><button onClick={() => setConfirmAction(null)}>{t("common.cancel")}</button><button className="danger" onClick={confirmAction.action}>{t("common.confirm")}</button></footer></section></div>}
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </div>;
}
