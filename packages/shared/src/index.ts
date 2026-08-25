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
  archivedFromStatus?: Exclude<QuestStatus, "archived">;
  difficulty: "Easy" | "Normal" | "Hard" | "Extreme";
  completionConditions: string;
  failureConsequence: string;
  parentQuestId?: string;
  stepOrder?: number;
  parentClosedAt?: string;
  seriesId?: string;
  templateId?: string;
  routineDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type QuestTemplate = {
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

export type BossAttempt = {
  id: string;
  bossQuestId: string;
  attemptNumber: number;
  outcome: "failed" | "cleared";
  result: string;
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
  bossAttempts?: BossAttempt[];
  questTemplates?: QuestTemplate[];
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

export type QuestCommand =
  | { action: "create" | "update"; quest: Quest }
  | {
      action: "save_with_path";
      mode: "create" | "update";
      quest: Quest;
      attribute?: Pick<Attribute, "id" | "name" | "color">;
      skill?: Pick<Skill, "id" | "attributeId" | "name">;
    }
  | { action: "delete" | "complete" | "fail" | "retry" | "archive" | "restore" | "undo_completion"; questId: string }
  | { action: "note"; questId: string; note: string }
  | { action: "boss_attempt"; bossQuestId: string; outcome: "failed" | "cleared"; result: string }
  | { action: "undo_boss_clear"; bossQuestId: string };

export type GrowthCommand =
  | { action: "attribute_create"; id: string; name: string; color: string }
  | { action: "attribute_rename"; attributeId: string; name: string }
  | { action: "attribute_delete"; attributeId: string }
  | { action: "skill_create"; id: string; attributeId: string; name: string }
  | { action: "skill_rename"; skillId: string; name: string }
  | { action: "skill_delete"; skillId: string };

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

function dateAtTemplateTime(dateKey: string, time: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function templateId() {
  return `template-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function questTemplateFromQuest(quest: Quest, stamp = new Date().toISOString()): QuestTemplate | null {
  if (quest.type === "Boss" || quest.parentQuestId) return null;
  const start = new Date(quest.date);
  const end = quest.deadline ? new Date(quest.deadline) : null;
  const deadlineOffsetMinutes = end && Number.isFinite(end.getTime())
    ? Math.max(0, Math.min(43_200, Math.round((end.getTime() - start.getTime()) / 60_000)))
    : 0;
  return {
    id: templateId(),
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

export function migrateLegacyQuestRecurrence(state: WeAscendState, stamp = new Date().toISOString()): WeAscendState {
  const templates = state.questTemplates ?? [];
  const legacyQuests = state.quests.filter(quest =>
    quest.recurrence !== "none" &&
    quest.type !== "Boss" &&
    !quest.parentQuestId &&
    !templates.some(template => template.sourceQuestId === quest.id)
  );
  if (!legacyQuests.length) return state;

  const migratedTemplates = legacyQuests.flatMap(quest => {
    const template = questTemplateFromQuest(quest, stamp);
    if (!template) return [];
    const questDate = new Date(quest.date);
    return [{
      ...template,
      id: `template:legacy:${quest.id}`,
      schedule: quest.recurrence,
      weekdays: [questDate.getDay()],
      startDate: localDateKey(new Date()),
    } satisfies QuestTemplate];
  });

  return {
    ...state,
    questTemplates: [...migratedTemplates, ...templates],
    quests: state.quests.map(quest => legacyQuests.some(legacy => legacy.id === quest.id) ? { ...quest, recurrence: "none" as const, updatedAt: stamp } : quest),
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

export function addTemplateQuestForDate(state: WeAscendState, templateIdValue: string, dateKey: string, stamp = new Date().toISOString()) {
  const template = (state.questTemplates ?? []).find(item => item.id === templateIdValue);
  if (!template || state.quests.some(quest =>
    (quest.templateId === templateIdValue && quest.routineDate === dateKey) ||
    (quest.id === template.sourceQuestId && localDateKey(quest.date) === dateKey)
  )) return state;
  const attribute = state.attributes.find(item => item.id === template.attributeId && !item.deletedAt);
  const skill = state.skills.find(item => item.id === template.skillId && item.attributeId === template.attributeId && !item.deletedAt);
  if (!attribute || !skill) return state;
  return { ...state, quests: [questFromTemplate(template, dateKey, stamp), ...state.quests] };
}

export function materializeRoutineInstances(
  state: WeAscendState,
  date = new Date(),
  stamp = new Date().toISOString(),
  maxQuests = Number.POSITIVE_INFINITY,
) {
  const dateKey = localDateKey(date);
  return (state.questTemplates ?? []).reduce((current, template) => {
    if (current.quests.length >= maxQuests) return current;
    const start = dateAtTemplateTime(template.startDate, "00:00");
    const currentDate = dateAtTemplateTime(dateKey, "00:00");
    const elapsedDays = Math.round((currentDate.getTime() - start.getTime()) / 86_400_000);
    const due = template.startDate <= dateKey && (
      template.schedule === "daily" ||
      (template.schedule === "weekly" && template.weekdays.includes(date.getDay())) ||
      (template.schedule === "interval" && elapsedDays >= 0 && elapsedDays % (template.intervalDays ?? 2) === 0)
    );
    return due ? addTemplateQuestForDate(current, template.id, dateKey, stamp) : current;
  }, state);
}
