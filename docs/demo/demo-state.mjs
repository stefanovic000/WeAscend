/**
 * Deterministic demo state used only to capture documentation screenshots.
 *
 * It mirrors the shape of apps/web/app/domain.ts and is validated against the
 * real `isValidCloudState` guard before capture, so the documentation can never
 * drift away from the schema the product actually accepts.
 *
 * No real user data, no network calls, no database.
 */

export const DEMO_NOW = new Date("2026-11-03T10:15:00+01:00");
const DAY = 86_400_000;
const EPOCH = "2026-09-01T08:00:00.000Z";

/** Deterministic RNG so screenshots are reproducible between runs. */
function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

const at = (date, hours, minutes = 0) => {
  const copy = new Date(date);
  copy.setHours(hours, minutes, 0, 0);
  return copy.toISOString();
};

const dayKey = date => new Date(date).toISOString().slice(0, 10);

const attributes = [
  { id: "attr-mind", name: "Mind", color: "#866bff" },
  { id: "attr-body", name: "Body", color: "#32d6c5" },
  { id: "attr-craft", name: "Craft", color: "#f2b96e" },
];

const skills = [
  { id: "skill-deep-work", attributeId: "attr-mind", name: "Deep Work" },
  { id: "skill-systems", attributeId: "attr-mind", name: "Systems Thinking" },
  { id: "skill-strength", attributeId: "attr-body", name: "Strength" },
  { id: "skill-sleep", attributeId: "attr-body", name: "Recovery" },
  { id: "skill-typescript", attributeId: "attr-craft", name: "TypeScript" },
  { id: "skill-product", attributeId: "attr-craft", name: "Product Design" },
];

/**
 * XP keeps the demo internally consistent with the real scoring rules:
 * growth is derived from focus minutes, the other categories from a fixed scale.
 */
function scoring(category, xp) {
  if (category === "growth") {
    const focusMinutes = xp >= 40 ? 120 : xp >= 30 ? 75 : xp >= 20 ? 45 : xp >= 10 ? 30 : 15;
    return { focusMinutes, outputBonus: 0, xpRuleValue: undefined };
  }
  return { focusMinutes: undefined, outputBonus: undefined, xpRuleValue: xp };
}

/** Title pool per skill: [title, xp, category]. */
const pool = {
  "skill-deep-work": [
    ["Deep work block: sync engine refactor", 30, "growth"],
    ["Deep work block: XP ledger rules", 30, "growth"],
    ["Deep work block: offline cache layer", 20, "growth"],
  ],
  "skill-systems": [
    ["Write the rate limiter design note", 20, "result"],
    ["Map the failure modes of the sync queue", 20, "growth"],
    ["Design review: single-writer ledger", 10, "result"],
  ],
  "skill-strength": [
    ["Strength session: 5x5 squats", 20, "growth"],
    ["Strength session: pull-up ladder", 10, "growth"],
    ["Mobility session + 20 min walk", 5, "maintenance"],
  ],
  "skill-sleep": [
    ["Sleep before 23:30", 5, "maintenance"],
    ["Evening shutdown routine", 5, "maintenance"],
  ],
  "skill-typescript": [
    ["TypeScript: generics exercises", 20, "growth"],
    ["Write 12 integration tests", 30, "result"],
    ["Migrate the worker to strict types", 20, "growth"],
  ],
  "skill-product": [
    ["Draft the Q4 roadmap one-pager", 20, "result"],
    ["Usability pass on the quest editor", 20, "result"],
    ["Record the 90-second product demo", 10, "result"],
  ],
};

function makeQuest({ id, title, skillId, xp, category, date, status, completedAt, note, parentQuestId, stepOrder, type = "Side" }) {
  const skill = skills.find(item => item.id === skillId);
  return {
    id,
    title,
    description: "",
    type,
    attributeId: skill.attributeId,
    skillId,
    xp,
    xpCategory: category,
    ...scoring(category, xp),
    xpSource: "rules",
    date,
    deadline: "",
    recurrence: "none",
    difficulty: "Normal",
    completionConditions: "",
    failureConsequence: "",
    status,
    ...(note ? { note } : {}),
    ...(parentQuestId ? { parentQuestId, stepOrder } : {}),
    createdAt: date,
    updatedAt: completedAt ?? date,
    ...(completedAt ? { completedAt } : {}),
  };
}

export function buildDemoState() {
  const random = rng(20_261_103);
  const quests = [];
  const transactions = [];

  let sequence = 0;
  const pushQuest = quest => {
    quests.push(quest);
    if (quest.status === "completed" && quest.xp > 0) {
      transactions.push({
        id: `tx-${String(++sequence).padStart(4, "0")}`,
        questId: quest.id,
        amount: quest.xp,
        kind: "quest",
        attributeId: quest.attributeId,
        skillId: quest.skillId,
        createdAt: quest.completedAt,
      });
    }
  };

  // Ten weeks of believable history: one or two finished quests per day.
  for (let back = 70; back >= 1; back -= 1) {
    const date = new Date(DEMO_NOW.getTime() - back * DAY);
    const perDay = random() < 0.45 ? 2 : 1;
    for (let index = 0; index < perDay; index += 1) {
      const skillId = skills[Math.floor(random() * skills.length)].id;
      const options = pool[skillId];
      const [title, xp, category] = options[Math.floor(random() * options.length)];
      pushQuest(makeQuest({
        id: `quest-${dayKey(date)}-${index}`,
        title,
        skillId,
        xp,
        category,
        date: at(date, 8, 30),
        status: "completed",
        completedAt: at(date, 9 + index * 6, 20 + Math.floor(random() * 30)),
      }));
    }
  }

  const today = DEMO_NOW;

  // Today, already cleared.
  pushQuest(makeQuest({
    id: "quest-today-deep-work",
    title: "Deep work block: finish the sync queue refactor",
    skillId: "skill-deep-work",
    xp: 30,
    category: "growth",
    date: at(today, 8, 30),
    status: "completed",
    completedAt: at(today, 9, 55),
    note: "Removed the last whole-state write from the native client. The ledger is the only place XP can come from.",
  }));

  // Today, still open — the card the dashboard leads with.
  pushQuest(makeQuest({
    id: "quest-today-roadmap",
    title: "Draft the Q4 roadmap one-pager",
    skillId: "skill-product",
    xp: 20,
    category: "result",
    date: at(today, 11, 0),
    status: "active",
    type: "Main",
  }));

  pushQuest(makeQuest({
    id: "quest-today-strength",
    title: "Strength session — squats + pull-ups",
    skillId: "skill-strength",
    xp: 10,
    category: "growth",
    date: at(today, 18, 0),
    status: "active",
  }));

  pushQuest(makeQuest({
    id: "quest-today-copy",
    title: "Ship the landing page copy",
    skillId: "skill-product",
    xp: 0,
    category: "result",
    date: at(today, 14, 0),
    status: "failed",
  }));

  // Boss with preparation steps.
  const bossDate = new Date(DEMO_NOW.getTime() + 18 * DAY);
  const bossId = "quest-boss-beta";
  quests.push({
    id: bossId,
    title: "Launch WeAscend public beta",
    description: "Open the product to the first 100 external hunters without losing a single XP transaction.",
    type: "Boss",
    attributeId: "attr-craft",
    skillId: "skill-product",
    xp: 300,
    xpCategory: "boss",
    xpRuleValue: 300,
    xpSource: "rules",
    date: at(bossDate, 19, 0),
    deadline: at(new Date(bossDate.getTime() + DAY), 23, 0),
    recurrence: "none",
    difficulty: "Extreme",
    completionConditions: "100 external accounts created, zero data-loss reports for 14 days.",
    failureConsequence: "Beta slips one month; the launch post is rewritten.",
    status: "active",
    createdAt: at(today, 8, 0),
    updatedAt: at(today, 8, 0),
  });

  const steps = [
    ["Profile the Mongo round-trips", "skill-typescript", 20, 0],
    ["Write the launch checklist", "skill-product", 10, 1],
    ["Record the 90-second product demo", "skill-product", 10, 2],
    ["Harden the email verification flow", "skill-typescript", 30, 3],
  ];
  steps.forEach(([title, skillId, xp, stepOrder], index) => {
    pushQuest(makeQuest({
      id: `quest-boss-step-${index}`,
      title,
      skillId,
      xp,
      category: "growth",
      date: at(new Date(DEMO_NOW.getTime() + (2 + index * 3) * DAY), 10, 0),
      status: "active",
      parentQuestId: bossId,
      stepOrder,
    }));
  });

  const templates = [
    {
      id: "template-morning-review",
      title: "Morning review",
      description: "Five minutes: read yesterday's note, pick the one quest that matters.",
      type: "Daily",
      attributeId: "attr-mind",
      skillId: "skill-deep-work",
      xp: 5,
      xpCategory: "maintenance",
      xpRuleValue: 5,
      xpSource: "rules",
      difficulty: "Easy",
      completionConditions: "One priority quest selected for today.",
      failureConsequence: "",
      schedule: "daily",
      intervalDays: 2,
      weekdays: [1],
      startDate: "2026-09-01",
      time: "08:30",
      deadlineOffsetMinutes: 60,
      createdAt: EPOCH,
      updatedAt: EPOCH,
    },
    {
      id: "template-deep-work",
      title: "90-minute deep work block",
      description: "One skill, one outcome, no notifications.",
      type: "Main",
      attributeId: "attr-craft",
      skillId: "skill-typescript",
      xp: 30,
      xpCategory: "growth",
      focusMinutes: 90,
      outputBonus: 0,
      xpSource: "rules",
      difficulty: "Hard",
      completionConditions: "A committed change or a written decision.",
      failureConsequence: "",
      schedule: "weekly",
      intervalDays: 2,
      weekdays: [1, 3, 5],
      startDate: "2026-09-01",
      time: "09:00",
      deadlineOffsetMinutes: 120,
      createdAt: EPOCH,
      updatedAt: EPOCH,
    },
    {
      id: "template-weekly-review",
      title: "Weekly review",
      description: "Close the week: numbers, misses, next week's single focus.",
      type: "Daily",
      attributeId: "attr-mind",
      skillId: "skill-systems",
      xp: 10,
      xpCategory: "maintenance",
      xpRuleValue: 10,
      xpSource: "rules",
      difficulty: "Normal",
      completionConditions: "One page of notes and next week's focus written.",
      failureConsequence: "",
      schedule: "weekly",
      intervalDays: 2,
      weekdays: [0],
      startDate: "2026-09-01",
      time: "17:00",
      deadlineOffsetMinutes: 180,
      createdAt: EPOCH,
      updatedAt: EPOCH,
    },
  ];

  return {
    version: 1,
    attributes: attributes.map(attribute => ({ ...attribute, createdAt: EPOCH, updatedAt: EPOCH })),
    skills: skills.map(skill => ({ ...skill, createdAt: EPOCH, updatedAt: EPOCH })),
    quests,
    transactions,
    bosses: [],
    bossAttempts: [],
    questTemplates: templates,
    settings: {
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
      tutorialCompleted: true,
      spellcheck: true,
      hapticFeedback: false,
    },
    levelEvents: [
      { id: "level-5", type: "level", value: "5", createdAt: at(new Date(DEMO_NOW.getTime() - 44 * DAY), 21, 0) },
      { id: "level-10", type: "level", value: "10", createdAt: at(new Date(DEMO_NOW.getTime() - 12 * DAY), 22, 10) },
    ],
  };
}

export function demoTotalXp(state) {
  return state.transactions.reduce((sum, transaction) => sum + (transaction.reversedAt ? 0 : transaction.amount), 0);
}

export function demoPlan() {
  return {
    name: "premium",
    source: "beta_grant",
    complimentary: true,
    limits: { xpEstimates: 150, xpArguments: 100, bossPlans: 10, questStorage: 1_000 },
    limitsEnforced: false,
    billingEnabled: false,
  };
}

export function demoUser() {
  return { id: "demo-hunter", email: "hunter@weascend.app", name: "Hunter", emailVerified: true };
}
