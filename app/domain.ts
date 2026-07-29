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
  seriesId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
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
export interface AppState {
  version: 1;
  attributes: Attribute[];
  skills: Skill[];
  quests: Quest[];
  transactions: XpTransaction[];
  bosses: Boss[];
  settings: Settings;
  levelEvents: { id: string; type: "level" | "rank"; value: string; createdAt: string }[];
}

export type QuestMutation =
  | { action: "create"; quest: Quest }
  | { action: "update"; quest: Quest }
  | { action: "delete"; questId: string };

export type QuestMutationResult =
  | { ok: true; state: AppState }
  | { ok: false; code: "invalid_quest" | "quest_not_found" };

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
      ? { ...quest, status: "archived", updatedAt: stamp }
      : quest),
  };
}

export function deleteQuestFromState(state: AppState, questId: string): AppState {
  return {
    ...state,
    quests: state.quests.filter(quest => quest.id !== questId),
  };
}

const QUEST_TYPES: QuestType[] = ["Main", "Daily", "Side", "Mandatory", "Correction", "Boss"];
const QUEST_STATUSES: QuestStatus[] = ["active", "completed", "failed", "skipped", "archived"];
const QUEST_RECURRENCES: Quest["recurrence"][] = ["none", "daily", "weekly"];
const QUEST_DIFFICULTIES: Quest["difficulty"][] = ["Easy", "Normal", "Hard", "Extreme"];
const XP_SOURCES: XpSource[] = ["rules", "ai", "argument", "manual", "legacy"];

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
    (quest.seriesId === undefined || boundedString(quest.seriesId, 120, true)) &&
    boundedString(quest.createdAt, 100, true) &&
    boundedString(quest.updatedAt, 100, true) &&
    (quest.completedAt === undefined || boundedString(quest.completedAt, 100, true));
}

export function applyQuestMutation(state: AppState, mutation: QuestMutation, stamp = new Date().toISOString()): QuestMutationResult {
  if (mutation.action === "delete") {
    if (!boundedString(mutation.questId, 120, true)) return { ok: false, code: "invalid_quest" };
    return { ok: true, state: deleteQuestFromState(state, mutation.questId) };
  }

  if (!isValidQuest(mutation.quest)) return { ok: false, code: "invalid_quest" };
  const skill = state.skills.find(item => item.id === mutation.quest.skillId);
  if (!state.attributes.some(item => item.id === mutation.quest.attributeId) || skill?.attributeId !== mutation.quest.attributeId) {
    return { ok: false, code: "invalid_quest" };
  }

  const existing = state.quests.find(item => item.id === mutation.quest.id);
  if (mutation.action === "create") {
    if (existing) return { ok: true, state };
    const quest = { ...mutation.quest, status: "active" as const, completedAt: undefined, createdAt: stamp, updatedAt: stamp };
    return { ok: true, state: { ...state, quests: [quest, ...state.quests] } };
  }

  if (!existing) return { ok: false, code: "quest_not_found" };
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
  return value.quests.every(isValidQuest);
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
