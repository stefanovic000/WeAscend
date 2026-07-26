export type QuestType = "Main" | "Daily" | "Side" | "Mandatory" | "Correction" | "Boss";
export type QuestStatus = "active" | "completed" | "failed" | "skipped" | "archived";

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
};

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
  return value.quests.every(quest =>
    Number.isFinite(quest.xp) &&
    quest.xp >= 0 &&
    (quest.note === undefined || (typeof quest.note === "string" && quest.note.length <= 500))
  );
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
