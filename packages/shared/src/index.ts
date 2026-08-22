export const WEASCEND_APP_NAME = "WeAscend";
export const WEASCEND_APP_SCHEME = "weascend";

export type QuestType = "Main" | "Daily" | "Side" | "Mandatory" | "Correction" | "Boss";
export type QuestStatus = "active" | "completed" | "failed" | "skipped" | "archived";
export type XpCategory = "growth" | "maintenance" | "result" | "boss";
export type XpSource = "rules" | "ai" | "argument" | "manual" | "legacy";

export type RankRule = { name: string; minLevel: number };

export type Settings = {
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
  spellcheck?: boolean;
  hapticFeedback?: boolean;
};

export type Attribute = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type Skill = {
  id: string;
  attributeId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type Quest = {
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
  status: QuestStatus;
  difficulty: "Easy" | "Normal" | "Hard" | "Extreme";
  completionConditions: string;
  failureConsequence: string;
  parentQuestId?: string;
  stepOrder?: number;
  seriesId?: string;
  templateId?: string;
  routineDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type XpTransaction = {
  id: string;
  questId: string;
  amount: number;
  kind: "quest" | "boss_attempt";
  attributeId: string;
  skillId: string;
  createdAt: string;
  reversedAt?: string;
};

export type WeAscendState = {
  version: 1;
  attributes: Attribute[];
  skills: Skill[];
  quests: Quest[];
  transactions: XpTransaction[];
  bosses: unknown[];
  bossAttempts?: unknown[];
  questTemplates?: unknown[];
  settings: Settings;
  levelEvents: { id: string; type: "level" | "rank"; value: string; createdAt: string }[];
};

export type PlanOverview = {
  name: "free" | "premium";
  source: "free" | "beta_grant" | "promotion" | "web" | "google_play";
  complimentary: boolean;
  limits: {
    xpEstimates: number;
    xpArguments: number;
    bossPlans: number;
    questStorage: number;
  };
  limitsEnforced: boolean;
  billingEnabled: boolean;
};

export const defaultSettings: Settings = {
  baseXp: 100,
  levelGrowth: 25,
  ranks: [
    { name: "E", minLevel: 1 },
    { name: "D", minLevel: 20 },
    { name: "C", minLevel: 40 },
    { name: "B", minLevel: 60 },
    { name: "A", minLevel: 80 },
    { name: "S", minLevel: 100 },
  ],
  questTypes: ["Main", "Daily", "Side", "Mandatory", "Correction", "Boss"],
  dailyRepeatLimit: true,
  theme: "void",
  animations: true,
  notifications: false,
  manualXpOverride: false,
  tutorialCompleted: false,
  spellcheck: true,
  hapticFeedback: true,
};

export function makeInitialState(): WeAscendState {
  return {
    version: 1,
    attributes: [],
    skills: [],
    quests: [],
    transactions: [],
    bosses: [],
    bossAttempts: [],
    questTemplates: [],
    settings: defaultSettings,
    levelEvents: [],
  };
}

export function isWeAscendState(value: unknown): value is WeAscendState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<WeAscendState>;
  return state.version === 1 &&
    Array.isArray(state.attributes) &&
    Array.isArray(state.skills) &&
    Array.isArray(state.quests) &&
    Array.isArray(state.transactions) &&
    Array.isArray(state.bosses) &&
    Array.isArray(state.levelEvents) &&
    Boolean(state.settings && Array.isArray(state.settings.ranks));
}

export function activeXp(transactions: XpTransaction[]) {
  return transactions.reduce((sum, transaction) => sum + (transaction.reversedAt ? 0 : transaction.amount), 0);
}

export function xpForNextLevel(level: number, settings: Pick<Settings, "baseXp" | "levelGrowth">) {
  return settings.baseXp + settings.levelGrowth * Math.max(0, level - 1);
}

export function progressFromXp(totalXp: number, settings: Settings) {
  let level = 1;
  let spent = 0;
  while (totalXp - spent >= xpForNextLevel(level, settings)) {
    spent += xpForNextLevel(level, settings);
    level += 1;
    if (level > 10_000) break;
  }
  const current = totalXp - spent;
  const needed = xpForNextLevel(level, settings);
  return { level, current, needed, percent: Math.min(100, (current / needed) * 100) };
}

export function rankForLevel(level: number, ranks: RankRule[]) {
  return [...ranks]
    .sort((left, right) => left.minLevel - right.minLevel)
    .filter(rank => level >= rank.minLevel)
    .at(-1)?.name ?? "E";
}

export function localDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
