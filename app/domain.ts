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
export interface Attribute { id: string; name: string; color: string; createdAt: string; updatedAt: string }
export interface Skill { id: string; attributeId: string; name: string; createdAt: string; updatedAt: string }
export interface Quest {
  id: string;
  title: string;
  description: string;
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

export function makeInitialState(): AppState {
  const now = new Date();
  const stamp = now.toISOString();
  const todayAt = (h: number, m = 0) => {
    const d = new Date(now); d.setHours(h, m, 0, 0); return d.toISOString();
  };
  const intelligence = "attr-intelligence";
  const strength = "attr-strength";
  const university = "skill-university";
  const spanish = "skill-spanish";
  const gym = "skill-gym";
  return {
    version: 1,
    settings: defaultSettings,
    attributes: [
      { id: intelligence, name: "Intelligence", color: "#866bff", createdAt: stamp, updatedAt: stamp },
      { id: strength, name: "Strength", color: "#32d6c5", createdAt: stamp, updatedAt: stamp },
    ],
    skills: [
      { id: university, attributeId: intelligence, name: "University", createdAt: stamp, updatedAt: stamp },
      { id: spanish, attributeId: intelligence, name: "Spanish", createdAt: stamp, updatedAt: stamp },
      { id: gym, attributeId: strength, name: "Gym", createdAt: stamp, updatedAt: stamp },
    ],
    quests: [
      { id: "quest-main", title: "Duboki rad: ključni projekat", description: "Jedan fokus blok bez prekida.", type: "Main", attributeId: intelligence, skillId: university, xp: 40, date: todayAt(9), deadline: todayAt(12), recurrence: "none", difficulty: "Hard", completionConditions: "90 minuta fokusiranog rada", failureConsequence: "", status: "active", createdAt: stamp, updatedAt: stamp },
      { id: "quest-spanish", title: "Španski — aktivno ponavljanje", description: "Govorne kartice i 10 novih reči.", type: "Daily", attributeId: intelligence, skillId: spanish, xp: 10, date: todayAt(17), deadline: todayAt(19), recurrence: "daily", difficulty: "Normal", completionConditions: "30 minuta aktivne vežbe", failureConsequence: "", status: "active", createdAt: stamp, updatedAt: stamp },
      { id: "quest-gym", title: "Trening snage", description: "Planirani trening A.", type: "Mandatory", attributeId: strength, skillId: gym, xp: 25, date: todayAt(18, 30), deadline: todayAt(21), recurrence: "weekly", difficulty: "Hard", completionConditions: "Završen plan treninga", failureConsequence: "Sledećeg jutra 20 min šetnje bez telefona", status: "active", createdAt: stamp, updatedAt: stamp },
    ],
    transactions: [],
    bosses: [
      { id: "boss-exam", title: "Završni ispit", dungeon: "Letnji semestar", stage: "Finalna provera", entryConditions: "Svi pripremni moduli završeni", preparationQuestIds: ["quest-main"], date: new Date(now.getTime() + 14 * 86400000).toISOString(), clearCondition: "Ocena 6 ili viša", xp: 300, attemptXp: 0, status: "active", result: "", createdAt: stamp, updatedAt: stamp },
    ],
    levelEvents: [],
  };
}
