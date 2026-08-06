export type QuestType = "Main" | "Daily" | "Side" | "Mandatory" | "Correction" | "Boss";
export type QuestStatus = "active" | "completed" | "failed" | "skipped" | "archived";
export type XpCategory = "growth" | "maintenance" | "result" | "boss";
export type XpSource = "rules" | "ai" | "argument" | "manual" | "legacy";

export const XP_BY_CATEGORY = {
  growth: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
  maintenance: [0, 5, 10],
  result: [0, 10, 20, 30],
  boss: [0, 75, 100, 150, 200, 300, 400],
} as const;

export interface RankRule { name: string; minLevel: number }
export interface Settings {
  baseXp: number;
  levelGrowth: number;
  ranks: RankRule[];
  questTypes: QuestType[];
  dailyRepeatLimit: boolean;
  theme: "void" | "abyss";
  animations: boolean;
  notifications: boolean;
  manualXpOverride?: boolean;
  tutorialCompleted?: boolean;
}
export interface Attribute { id: string; name: string; color: string; createdAt: string; updatedAt: string; deletedAt?: string }
export interface Skill { id: string; attributeId: string; name: string; createdAt: string; updatedAt: string; deletedAt?: string }
export interface Quest {
  id: string;
  title: string;
  description: string;
  note?: string;
  type: QuestType;
  attributeId: string;
  skillId: string;
  xp: number;
  xpCategory?: XpCategory;
  focusMinutes?: number;
  outputBonus?: 0 | 5 | 10;
  xpRuleValue?: number;
  xpSource?: XpSource;
  xpArgumentReason?: string;
  date: string;
  deadline: string;
  recurrence: "none" | "daily" | "weekly";
  difficulty: "Easy" | "Normal" | "Hard" | "Extreme";
  completionConditions: string;
  failureConsequence: string;
  status: QuestStatus;
  archivedFromStatus?: Exclude<QuestStatus, "archived">;
  seriesId?: string;
  parentQuestId?: string;
  stepOrder?: number;
  parentClosedAt?: string;
  templateId?: string;
  routineDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
export interface QuestTemplate {
  id: string;
  sourceQuestId?: string;
  title: string;
  description: string;
  type: Exclude<QuestType, "Boss">;
  attributeId: string;
  skillId: string;
  xp: number;
  xpCategory?: XpCategory;
  focusMinutes?: number;
  outputBonus?: 0 | 5 | 10;
  xpRuleValue?: number;
  xpSource?: XpSource;
  difficulty: Quest["difficulty"];
  completionConditions: string;
  failureConsequence: string;
  schedule: "none" | "daily" | "weekly" | "interval";
  intervalDays?: number;
  weekdays: number[];
  startDate: string;
  time: string;
  deadlineOffsetMinutes: number;
  createdAt: string;
  updatedAt: string;
}
export interface XpTransaction {
  id: string;
  questId: string;
  amount: number;
  kind: "quest" | "boss_attempt";
  attributeId: string;
  skillId: string;
  createdAt: string;
  reversedAt?: string;
}
export interface Boss {
  id: string;
  title: string;
  dungeon: string;
  stage: string;
  entryConditions: string;
  preparationQuestIds: string[];
  date: string;
  clearCondition: string;
  xp: number;
  attemptXp: number;
  status: "active" | "cleared" | "failed";
  result: string;
  createdAt: string;
  updatedAt: string;
}
export interface BossAttempt {
  id: string;
  bossQuestId: string;
  attemptNumber: number;
  outcome: "failed" | "cleared";
  result: string;
  createdAt: string;
  reversedAt?: string;
}
export interface AppState {
  version: 1;
  attributes: Attribute[];
  skills: Skill[];
  quests: Quest[];
  transactions: XpTransaction[];
  bosses: Boss[];
  bossAttempts?: BossAttempt[];
  questTemplates?: QuestTemplate[];
  settings: Settings;
  levelEvents: { id: string; type: "level" | "rank"; value: string; createdAt: string }[];
}

export type QuestMutation =
  | { action: "create"; quest: Quest }
  | { action: "create_many"; quests: Quest[] }
  | { action: "update"; quest: Quest }
  | { action: "delete"; questId: string }
  | { action: "boss_attempt"; bossQuestId: string; outcome: "failed" | "cleared"; result: string }
  | { action: "undo_boss_clear"; bossQuestId: string };

export type QuestMutationResult =
  | { ok: true; state: AppState }
  | { ok: false; code: "invalid_quest" | "quest_not_found" | "invalid_attempt" | "boss_already_cleared" | "earned_quest_locked" };

export const defaultSettings: Settings = {
  baseXp: 100,
  levelGrowth: 25,
  ranks: [
    { name: "E", minLevel: 1 }, { name: "D", minLevel: 20 }, { name: "C", minLevel: 40 },
    { name: "B", minLevel: 60 }, { name: "A", minLevel: 80 }, { name: "S", minLevel: 100 },
  ],
  questTypes: ["Main", "Daily", "Side", "Mandatory", "Correction", "Boss"],
  dailyRepeatLimit: true,
  theme: "void",
  animations: true,
  notifications: false,
  manualXpOverride: false,
  tutorialCompleted: false,
};

export type QuestScoringInput = Pick<Quest, "type" | "xpCategory" | "focusMinutes" | "outputBonus" | "xpRuleValue">;

export function questXpCategory(quest: Pick<Quest, "type" | "xpCategory">): XpCategory {
  return quest.xpCategory ?? (quest.type === "Boss" ? "boss" : "growth");
}

export function allowedXpForCategory(category: XpCategory): readonly number[] {
  return XP_BY_CATEGORY[category];
}

export function focusedWorkXp(minutes: number) {
  if (minutes < 15) return 0;
  if (minutes < 30) return 5;
  if (minutes < 45) return 10;
  if (minutes < 75) return 20;
  if (minutes < 120) return 30;
  return 40;
}

export function calculateQuestXp(quest: QuestScoringInput) {
  const category = questXpCategory(quest);
  if (category === "growth") {
    const base = focusedWorkXp(Math.max(0, Number(quest.focusMinutes) || 0));
    const bonus = quest.outputBonus === 5 || quest.outputBonus === 10 ? quest.outputBonus : 0;
    return { category, base, bonus, xp: Math.min(50, base + bonus) };
  }

  const allowed = allowedXpForCategory(category);
  const fallback = category === "maintenance" ? 0 : category === "result" ? 20 : 100;
  const selected = Number(quest.xpRuleValue);
  const xp = (allowed as readonly number[]).includes(selected) ? selected : fallback;
  return { category, base: xp, bonus: 0, xp };
}

export function xpForNextLevel(level: number, settings: Pick<Settings, "baseXp" | "levelGrowth">) {
  return settings.baseXp + settings.levelGrowth * Math.max(0, level - 1);
}

export function progressFromXp(totalXp: number, settings: Settings) {
  let level = 1;
  let spent = 0;
  while (totalXp - spent >= xpForNextLevel(level, settings)) {
    spent += xpForNextLevel(level, settings);
    level++;
    if (level > 10000) break;
  }
  const current = totalXp - spent;
  const needed = xpForNextLevel(level, settings);
  return { level, current, needed, percent: Math.min(100, (current / needed) * 100) };
}

export function rankForLevel(level: number, ranks: RankRule[]) {
  return [...ranks].sort((a, b) => a.minLevel - b.minLevel).filter(r => level >= r.minLevel).at(-1)?.name ?? "E";
}

export function activeXp(transactions: XpTransaction[]) {
  return transactions.reduce((sum, tx) => sum + (tx.reversedAt ? 0 : tx.amount), 0);
}

export function deleteAttributeFromState(state: AppState, attributeId: string, stamp = new Date().toISOString()): AppState {
  const relatedSkills = state.skills.filter(skill => skill.attributeId === attributeId);
  const hasHistory =
    state.quests.some(quest => quest.attributeId === attributeId) ||
    state.transactions.some(transaction => transaction.attributeId === attributeId) ||
    relatedSkills.some(skill => !!skill.deletedAt);

  if (!hasHistory) {
    return {
      ...state,
      attributes: state.attributes.filter(attribute => attribute.id !== attributeId),
      skills: state.skills.filter(skill => skill.attributeId !== attributeId),
    };
  }

  return {
    ...state,
    attributes: state.attributes.map(attribute => attribute.id === attributeId
      ? { ...attribute, deletedAt: stamp, updatedAt: stamp }
      : attribute),
    skills: state.skills.map(skill => skill.attributeId === attributeId
      ? { ...skill, deletedAt: skill.deletedAt ?? stamp, updatedAt: stamp }
      : skill),
    quests: state.quests.map(quest => quest.attributeId === attributeId && quest.status === "active"
      ? { ...quest, status: "archived", archivedFromStatus: quest.status, updatedAt: stamp }
      : quest),
  };
}

export function deleteQuestFromState(state: AppState, questId: string): AppState {
  const questIds = new Set([
    questId,
    ...state.quests.filter(quest => quest.parentQuestId === questId).map(quest => quest.id),
  ]);
  return {
    ...state,
    quests: state.quests.filter(quest => !questIds.has(quest.id)),
    bossAttempts: (state.bossAttempts ?? []).filter(attempt => attempt.bossQuestId !== questId),
  };
}

const QUEST_TYPES: QuestType[] = ["Main", "Daily", "Side", "Mandatory", "Correction", "Boss"];
const QUEST_STATUSES: QuestStatus[] = ["active", "completed", "failed", "skipped", "archived"];
const QUEST_RECURRENCES: Quest["recurrence"][] = ["none", "daily", "weekly"];
const QUEST_DIFFICULTIES: Quest["difficulty"][] = ["Easy", "Normal", "Hard", "Extreme"];
const XP_SOURCES: XpSource[] = ["rules", "ai", "argument", "manual", "legacy"];
const TEMPLATE_SCHEDULES: QuestTemplate["schedule"][] = ["none", "daily", "weekly", "interval"];

function boundedString(value: unknown, maxLength: number, required = false) {
  return typeof value === "string" && value.length <= maxLength && (!required || value.trim().length > 0);
}

export function isValidQuest(value: unknown): value is Quest {
  if (!value || typeof value !== "object") return false;
  const quest = value as Partial<Quest>;
  return boundedString(quest.id, 120, true) &&
    boundedString(quest.title, 500, true) &&
    boundedString(quest.description, 10_000) &&
    (quest.note === undefined || boundedString(quest.note, 500)) &&
    QUEST_TYPES.includes(quest.type as QuestType) &&
    boundedString(quest.attributeId, 120, true) &&
    boundedString(quest.skillId, 120, true) &&
    Number.isFinite(quest.xp) &&
    Number(quest.xp) >= 0 &&
    (quest.xpCategory === undefined || Object.hasOwn(XP_BY_CATEGORY, quest.xpCategory)) &&
    (quest.focusMinutes === undefined || (Number.isFinite(quest.focusMinutes) && Number(quest.focusMinutes) >= 0 && Number(quest.focusMinutes) <= 1440)) &&
    (quest.outputBonus === undefined || quest.outputBonus === 0 || quest.outputBonus === 5 || quest.outputBonus === 10) &&
    (quest.xpRuleValue === undefined || Number.isFinite(quest.xpRuleValue)) &&
    (quest.xpSource === undefined || XP_SOURCES.includes(quest.xpSource)) &&
    (quest.xpArgumentReason === undefined || boundedString(quest.xpArgumentReason, 800)) &&
    boundedString(quest.date, 100, true) &&
    boundedString(quest.deadline, 100) &&
    QUEST_RECURRENCES.includes(quest.recurrence as Quest["recurrence"]) &&
    QUEST_DIFFICULTIES.includes(quest.difficulty as Quest["difficulty"]) &&
    boundedString(quest.completionConditions, 10_000) &&
    boundedString(quest.failureConsequence, 10_000) &&
    QUEST_STATUSES.includes(quest.status as QuestStatus) &&
    (quest.archivedFromStatus === undefined || (QUEST_STATUSES.includes(quest.archivedFromStatus) && quest.archivedFromStatus !== "archived")) &&
    (quest.seriesId === undefined || boundedString(quest.seriesId, 120, true)) &&
    (quest.parentQuestId === undefined || boundedString(quest.parentQuestId, 120, true)) &&
    (quest.stepOrder === undefined || (Number.isInteger(quest.stepOrder) && Number(quest.stepOrder) >= 0 && Number(quest.stepOrder) <= 10_000)) &&
    (quest.parentClosedAt === undefined || boundedString(quest.parentClosedAt, 100, true)) &&
    (quest.templateId === undefined || boundedString(quest.templateId, 80, true)) &&
    (quest.routineDate === undefined || /^\d{4}-\d{2}-\d{2}$/.test(quest.routineDate)) &&
    boundedString(quest.createdAt, 100, true) &&
    boundedString(quest.updatedAt, 100, true) &&
    (quest.completedAt === undefined || boundedString(quest.completedAt, 100, true));
}

export function isValidQuestTemplate(value: unknown): value is QuestTemplate {
  if (!value || typeof value !== "object") return false;
  const template = value as Partial<QuestTemplate>;
  return boundedString(template.id, 80, true) &&
    (template.sourceQuestId === undefined || boundedString(template.sourceQuestId, 120, true)) &&
    boundedString(template.title, 500, true) &&
    boundedString(template.description, 10_000) &&
    QUEST_TYPES.includes(template.type as QuestType) && template.type !== "Boss" &&
    boundedString(template.attributeId, 120, true) &&
    boundedString(template.skillId, 120, true) &&
    Number.isFinite(template.xp) && Number(template.xp) >= 0 &&
    (template.xpCategory === undefined || Object.hasOwn(XP_BY_CATEGORY, template.xpCategory)) &&
    (template.focusMinutes === undefined || (Number.isFinite(template.focusMinutes) && Number(template.focusMinutes) >= 0 && Number(template.focusMinutes) <= 1440)) &&
    (template.outputBonus === undefined || template.outputBonus === 0 || template.outputBonus === 5 || template.outputBonus === 10) &&
    (template.xpRuleValue === undefined || Number.isFinite(template.xpRuleValue)) &&
    (template.xpSource === undefined || XP_SOURCES.includes(template.xpSource)) &&
    QUEST_DIFFICULTIES.includes(template.difficulty as Quest["difficulty"]) &&
    boundedString(template.completionConditions, 10_000) &&
    boundedString(template.failureConsequence, 10_000) &&
    TEMPLATE_SCHEDULES.includes(template.schedule as QuestTemplate["schedule"]) &&
    (template.intervalDays === undefined || (Number.isInteger(template.intervalDays) && template.intervalDays >= 2 && template.intervalDays <= 365)) &&
    Array.isArray(template.weekdays) && template.weekdays.length <= 7 &&
    template.weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6) &&
    new Set(template.weekdays).size === template.weekdays.length &&
    typeof template.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(template.startDate) &&
    typeof template.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(template.time) &&
    Number.isInteger(template.deadlineOffsetMinutes) && template.deadlineOffsetMinutes >= 0 && template.deadlineOffsetMinutes <= 43_200 &&
    boundedString(template.createdAt, 100, true) &&
    boundedString(template.updatedAt, 100, true);
}

const localDateKey = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

function dateAtTemplateTime(dateKey: string, time: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function questTemplateFromQuest(quest: Quest, stamp = new Date().toISOString()): QuestTemplate | null {
  if (quest.type === "Boss" || quest.parentQuestId) return null;
  const start = new Date(quest.date);
  const end = quest.deadline ? new Date(quest.deadline) : null;
  const deadlineOffsetMinutes = end && Number.isFinite(end.getTime())
    ? Math.max(0, Math.min(43_200, Math.round((end.getTime() - start.getTime()) / 60_000)))
    : 0;
  return {
    id: crypto.randomUUID(),
    sourceQuestId: quest.id,
    title: quest.title,
    description: quest.description,
    type: quest.type,
    attributeId: quest.attributeId,
    skillId: quest.skillId,
    xp: quest.xp,
    xpCategory: quest.xpCategory,
    focusMinutes: quest.focusMinutes,
    outputBonus: quest.outputBonus,
    xpRuleValue: quest.xpRuleValue,
    xpSource: quest.xpSource,
    difficulty: quest.difficulty,
    completionConditions: quest.completionConditions,
    failureConsequence: quest.failureConsequence,
    schedule: "none",
    intervalDays: 2,
    weekdays: [start.getDay()],
    startDate: localDateKey(new Date()),
    time: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
    deadlineOffsetMinutes,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function questFromTemplate(template: QuestTemplate, dateKey: string, stamp = new Date().toISOString()): Quest {
  const start = dateAtTemplateTime(dateKey, template.time);
  const deadline = template.deadlineOffsetMinutes > 0
    ? new Date(start.getTime() + template.deadlineOffsetMinutes * 60_000).toISOString()
    : "";
  return {
    id: `routine:${template.id}:${dateKey}`,
    title: template.title,
    description: template.description,
    type: template.type,
    attributeId: template.attributeId,
    skillId: template.skillId,
    xp: template.xp,
    xpCategory: template.xpCategory,
    focusMinutes: template.focusMinutes,
    outputBonus: template.outputBonus,
    xpRuleValue: template.xpRuleValue,
    xpSource: template.xpSource,
    date: start.toISOString(),
    deadline,
    recurrence: "none",
    difficulty: template.difficulty,
    completionConditions: template.completionConditions,
    failureConsequence: template.failureConsequence,
    status: "active",
    templateId: template.id,
    routineDate: dateKey,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function addTemplateQuestForDate(state: AppState, templateId: string, dateKey: string, stamp = new Date().toISOString()) {
  const template = (state.questTemplates ?? []).find(item => item.id === templateId);
  if (!template || state.quests.some(quest =>
    (quest.templateId === templateId && quest.routineDate === dateKey) ||
    (quest.id === template.sourceQuestId && localDateKey(new Date(quest.date)) === dateKey)
  )) return state;
  const attribute = state.attributes.find(item => item.id === template.attributeId && !item.deletedAt);
  const skill = state.skills.find(item => item.id === template.skillId && item.attributeId === template.attributeId && !item.deletedAt);
  if (!attribute || !skill) return state;
  return { ...state, quests: [questFromTemplate(template, dateKey, stamp), ...state.quests] };
}

export function materializeRoutineInstances(state: AppState, date = new Date(), stamp = new Date().toISOString()) {
  const dateKey = localDateKey(date);
  return (state.questTemplates ?? []).reduce((current, template) => {
    const start = dateAtTemplateTime(template.startDate, "00:00");
    const currentDate = dateAtTemplateTime(dateKey, "00:00");
    const elapsedDays = Math.round((currentDate.getTime() - start.getTime()) / 86_400_000);
    const due = template.startDate <= dateKey && (
      template.schedule === "daily" ||
      (template.schedule === "weekly" && template.weekdays.includes(date.getDay())) ||
      (template.schedule === "interval" && elapsedDays % (template.intervalDays ?? 2) === 0)
    );
    return due ? addTemplateQuestForDate(current, template.id, dateKey, stamp) : current;
  }, state);
}

export function applyQuestMutation(state: AppState, mutation: QuestMutation, stamp = new Date().toISOString()): QuestMutationResult {
  if (mutation.action === "create_many") {
    if (mutation.quests.length < 1 || mutation.quests.length > 12 || mutation.quests.some(quest => !isValidQuest(quest))) {
      return { ok: false, code: "invalid_quest" };
    }

    const existingIds = new Set(state.quests.map(quest => quest.id));
    const siblingTitles = new Set(state.quests
      .filter(quest => quest.parentQuestId)
      .map(quest => `${quest.parentQuestId}\u0000${quest.title.trim().toLocaleLowerCase()}`));
    const incomingIds = new Set<string>();

    for (const quest of mutation.quests) {
      const titleKey = `${quest.parentQuestId ?? ""}\u0000${quest.title.trim().toLocaleLowerCase()}`;
      if (!quest.parentQuestId || existingIds.has(quest.id) || incomingIds.has(quest.id) || siblingTitles.has(titleKey)) {
        return { ok: false, code: "invalid_quest" };
      }
      incomingIds.add(quest.id);
      siblingTitles.add(titleKey);
    }

    let nextState = state;
    for (const quest of mutation.quests) {
      const created = applyQuestMutation(nextState, { action: "create", quest }, stamp);
      if (!created.ok) return created;
      nextState = created.state;
    }
    return { ok: true, state: nextState };
  }

  if (mutation.action === "delete") {
    if (!boundedString(mutation.questId, 120, true)) return { ok: false, code: "invalid_quest" };
    return { ok: true, state: deleteQuestFromState(state, mutation.questId) };
  }

  if (mutation.action === "boss_attempt") {
    if (!boundedString(mutation.bossQuestId, 120, true) || !boundedString(mutation.result, 1_000, true)) {
      return { ok: false, code: "invalid_attempt" };
    }
    const boss = state.quests.find(quest => quest.id === mutation.bossQuestId && quest.type === "Boss");
    if (!boss) return { ok: false, code: "quest_not_found" };
    if (boss.status === "completed" || !canAwardQuest(boss.id, state.transactions)) {
      return { ok: false, code: "boss_already_cleared" };
    }

    const previousAttempts = state.bossAttempts ?? [];
    const attempt: BossAttempt = {
      id: crypto.randomUUID(),
      bossQuestId: boss.id,
      attemptNumber: previousAttempts.filter(item => item.bossQuestId === boss.id && !item.reversedAt).length + 1,
      outcome: mutation.outcome,
      result: mutation.result.trim(),
      createdAt: stamp,
    };
    if (mutation.outcome === "failed") {
      return {
        ok: true,
        state: {
          ...state,
          quests: state.quests.map(quest => quest.id === boss.id
            ? { ...quest, status: "active", completedAt: undefined, updatedAt: stamp }
            : quest),
          bossAttempts: [...previousAttempts, attempt],
        },
      };
    }

    const beforeXp = activeXp(state.transactions);
    const beforeProgress = progressFromXp(beforeXp, state.settings);
    const beforeRank = rankForLevel(beforeProgress.level, state.settings.ranks);
    const transaction: XpTransaction | null = boss.xp > 0 ? {
      id: crypto.randomUUID(),
      questId: boss.id,
      amount: boss.xp,
      kind: "quest",
      attributeId: boss.attributeId,
      skillId: boss.skillId,
      createdAt: stamp,
    } : null;
    const transactions = transaction ? [...state.transactions, transaction] : state.transactions;
    const afterProgress = progressFromXp(activeXp(transactions), state.settings);
    const afterRank = rankForLevel(afterProgress.level, state.settings.ranks);
    return {
      ok: true,
      state: {
        ...state,
        quests: state.quests.map(quest => {
          if (quest.id === boss.id) return { ...quest, status: "completed", completedAt: stamp, updatedAt: stamp };
          if (quest.parentQuestId === boss.id && quest.status === "active") {
            return { ...quest, status: "archived", archivedFromStatus: quest.status, parentClosedAt: stamp, updatedAt: stamp };
          }
          return quest;
        }),
        transactions,
        bossAttempts: [...previousAttempts, attempt],
        levelEvents: [
          ...state.levelEvents,
          ...(afterProgress.level > beforeProgress.level ? [{ id: crypto.randomUUID(), type: "level" as const, value: String(afterProgress.level), createdAt: stamp }] : []),
          ...(afterRank !== beforeRank ? [{ id: crypto.randomUUID(), type: "rank" as const, value: afterRank, createdAt: stamp }] : []),
        ],
      },
    };
  }

  if (mutation.action === "undo_boss_clear") {
    if (!boundedString(mutation.bossQuestId, 120, true)) return { ok: false, code: "invalid_attempt" };
    const boss = state.quests.find(quest => quest.id === mutation.bossQuestId && quest.type === "Boss");
    if (!boss) return { ok: false, code: "quest_not_found" };
    return {
      ok: true,
      state: {
        ...state,
        quests: state.quests.map(quest => {
          if (quest.id === boss.id) return { ...quest, status: "active", completedAt: undefined, updatedAt: stamp };
          if (quest.parentQuestId === boss.id && quest.parentClosedAt) {
            return { ...quest, status: "active", archivedFromStatus: undefined, parentClosedAt: undefined, updatedAt: stamp };
          }
          return quest;
        }),
        transactions: state.transactions.map(transaction => transaction.questId === boss.id && !transaction.reversedAt
          ? { ...transaction, reversedAt: stamp }
          : transaction),
        bossAttempts: (state.bossAttempts ?? []).map(attempt => attempt.bossQuestId === boss.id && attempt.outcome === "cleared" && !attempt.reversedAt
          ? { ...attempt, reversedAt: stamp }
          : attempt),
      },
    };
  }

  if (!isValidQuest(mutation.quest)) return { ok: false, code: "invalid_quest" };
  const skill = state.skills.find(item => item.id === mutation.quest.skillId);
  if (!state.attributes.some(item => item.id === mutation.quest.attributeId) || skill?.attributeId !== mutation.quest.attributeId) {
    return { ok: false, code: "invalid_quest" };
  }
  if (mutation.quest.parentQuestId) {
    const parent = state.quests.find(item => item.id === mutation.quest.parentQuestId);
    if (!parent || parent.type !== "Boss" || mutation.quest.type === "Boss" || parent.id === mutation.quest.id) {
      return { ok: false, code: "invalid_quest" };
    }
    if (mutation.action === "create" && (parent.status === "completed" || parent.status === "archived")) {
      return { ok: false, code: "invalid_quest" };
    }
  }

  const existing = state.quests.find(item => item.id === mutation.quest.id);
  if (mutation.action === "create") {
    if (existing) return { ok: true, state };
    const questInput = { ...mutation.quest };
    delete questInput.completedAt;
    const quest = { ...questInput, status: "active" as const, createdAt: stamp, updatedAt: stamp };
    return { ok: true, state: { ...state, quests: [quest, ...state.quests] } };
  }

  if (!existing) return { ok: false, code: "quest_not_found" };
  if (state.transactions.some(transaction => transaction.questId === existing.id && !transaction.reversedAt)) {
    const lockedFields: (keyof Quest)[] = [
      "title", "description", "type", "attributeId", "skillId", "xp", "xpCategory", "focusMinutes",
      "outputBonus", "xpRuleValue", "xpSource", "xpArgumentReason", "date", "deadline", "recurrence",
      "difficulty", "completionConditions", "failureConsequence", "seriesId", "parentQuestId", "stepOrder",
      "parentClosedAt", "templateId", "routineDate",
    ];
    if (lockedFields.some(field => existing[field] !== mutation.quest[field])) {
      return { ok: false, code: "earned_quest_locked" };
    }
  }
  const quest = { ...mutation.quest, id: existing.id, createdAt: existing.createdAt, updatedAt: stamp };
  return {
    ok: true,
    state: { ...state, quests: state.quests.map(item => item.id === existing.id ? quest : item) },
  };
}

export function canAwardQuest(questId: string, transactions: XpTransaction[]) {
  return !transactions.some(tx => tx.questId === questId && !tx.reversedAt);
}

export function nextRecurringInstance(quest: Quest, now = new Date()): Quest | null {
  if (quest.recurrence === "none") return null;
  const previous = new Date(quest.date);
  const next = new Date(previous);
  next.setDate(next.getDate() + (quest.recurrence === "daily" ? 1 : 7));
  const delta = next.getTime() - previous.getTime();
  const deadline = quest.deadline ? new Date(new Date(quest.deadline).getTime() + delta).toISOString() : "";
  const stamp = now.toISOString();
  return {
    ...quest,
    id: crypto.randomUUID(),
    seriesId: quest.seriesId ?? quest.id,
    date: next.toISOString(),
    deadline,
    note: undefined,
    xpArgumentReason: undefined,
    status: "active",
    archivedFromStatus: undefined,
    completedAt: undefined,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function isValidBackup(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const x = value as Partial<AppState>;
  return x.version === 1 && Array.isArray(x.attributes) && Array.isArray(x.skills) &&
    Array.isArray(x.quests) && Array.isArray(x.transactions) && Array.isArray(x.bosses) &&
    !!x.settings && Array.isArray(x.settings.ranks);
}

export function isValidCloudState(value: unknown): value is AppState {
  if (!isValidBackup(value)) return false;
  const activeAwards = new Set<string>();
  for (const transaction of value.transactions) {
    if (!Number.isFinite(transaction.amount) || transaction.amount < 0 || !transaction.questId) return false;
    if (!transaction.reversedAt) {
      if (activeAwards.has(transaction.questId)) return false;
      activeAwards.add(transaction.questId);
    }
  }
  return value.quests.every(isValidQuest) &&
    (value.questTemplates === undefined || (Array.isArray(value.questTemplates) && value.questTemplates.every(isValidQuestTemplate))) &&
    (value.bossAttempts === undefined || (
      Array.isArray(value.bossAttempts) &&
      value.bossAttempts.every(attempt =>
        boundedString(attempt.id, 120, true) &&
        boundedString(attempt.bossQuestId, 120, true) &&
        Number.isInteger(attempt.attemptNumber) &&
        attempt.attemptNumber > 0 &&
        (attempt.outcome === "failed" || attempt.outcome === "cleared") &&
        boundedString(attempt.result, 1_000, true) &&
        boundedString(attempt.createdAt, 100, true) &&
        (attempt.reversedAt === undefined || boundedString(attempt.reversedAt, 100, true))
      )
    ));
}

const NULLABLE_OPTIONAL_STATE_FIELDS = new Set([
  "deletedAt",
  "note",
  "archivedFromStatus",
  "xpCategory",
  "focusMinutes",
  "outputBonus",
  "xpRuleValue",
  "xpSource",
  "xpArgumentReason",
  "intervalDays",
  "seriesId",
  "parentQuestId",
  "stepOrder",
  "parentClosedAt",
  "completedAt",
  "reversedAt",
  "bossAttempts",
  "questTemplates",
  "manualXpOverride",
  "tutorialCompleted",
]);

export function normalizeCloudState(value: unknown): AppState | null {
  if (!value || typeof value !== "object") return null;
  try {
    const normalized = JSON.parse(JSON.stringify(value, (key, item) =>
      item === null && NULLABLE_OPTIONAL_STATE_FIELDS.has(key) ? undefined : item,
    )) as unknown;
    return isValidCloudState(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function makeInitialState(): AppState {
  return {
    version: 1,
    settings: defaultSettings,
    attributes: [],
    skills: [],
    quests: [],
    transactions: [],
    bosses: [],
    bossAttempts: [],
    questTemplates: [],
    levelEvents: [],
  };
}

export function isUntouchedDemoState(state: AppState) {
  return state.transactions.length === 0 &&
    state.attributes.length === 2 &&
    state.skills.length === 3 &&
    state.quests.length === 3 &&
    state.bosses.length === 1 &&
    state.quests.some(quest => quest.id === "quest-main") &&
    state.bosses.some(boss => boss.id === "boss-exam");
}
