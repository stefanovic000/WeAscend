import test from "node:test";
import assert from "node:assert/strict";
import { activeXp, applyQuestMutation, calculateQuestXp, canAwardQuest, defaultSettings, deleteAttributeFromState, deleteQuestFromState, isValidCloudState, isValidQuest, makeInitialState, nextRecurringInstance, normalizeCloudState, progressFromXp, rankForLevel, type Quest, type XpTransaction } from "../app/domain.ts";
import { translate } from "../app/i18n.ts";
import { parseXpSuggestion } from "../app/xpAdvisor.ts";
import { authenticateRequest } from "../server/auth.ts";

test("initial state is completely empty at level 1 with zero XP", () => {
  const state = makeInitialState();
  assert.equal(activeXp(state.transactions), 0);
  assert.equal(progressFromXp(0, state.settings).level, 1);
  assert.deepEqual(state.attributes, []);
  assert.deepEqual(state.skills, []);
  assert.deepEqual(state.quests, []);
  assert.deepEqual(state.bosses, []);
  assert.equal(state.settings.manualXpOverride, false);
});

test("the four XP categories produce deterministic rewards", () => {
  assert.equal(calculateQuestXp({ type: "Side", xpCategory: "growth", focusMinutes: 60, outputBonus: 5 }).xp, 25);
  assert.equal(calculateQuestXp({ type: "Side", xpCategory: "growth", focusMinutes: 120, outputBonus: 10 }).xp, 50);
  assert.equal(calculateQuestXp({ type: "Daily", xpCategory: "maintenance", xpRuleValue: 10 }).xp, 10);
  assert.equal(calculateQuestXp({ type: "Main", xpCategory: "result", xpRuleValue: 30 }).xp, 30);
  assert.equal(calculateQuestXp({ type: "Boss", xpCategory: "boss", xpRuleValue: 300 }).xp, 300);
});

test("invalid category values fall back to the category default", () => {
  assert.equal(calculateQuestXp({ type: "Side", xpCategory: "maintenance", xpRuleValue: 30 }).xp, 0);
  assert.equal(calculateQuestXp({ type: "Boss", xpCategory: "boss", xpRuleValue: 999 }).xp, 100);
});

test("level requirements grow and total XP maps to the correct level", () => {
  assert.deepEqual(progressFromXp(0, defaultSettings), { level: 1, current: 0, needed: 100, percent: 0 });
  assert.equal(progressFromXp(100, defaultSettings).level, 2);
  assert.equal(progressFromXp(224, defaultSettings).level, 2);
  assert.equal(progressFromXp(225, defaultSettings).level, 3);
});

test("rank thresholds are configurable", () => {
  assert.equal(rankForLevel(1, defaultSettings.ranks), "E");
  assert.equal(rankForLevel(40, defaultSettings.ranks), "C");
  assert.equal(rankForLevel(100, defaultSettings.ranks), "S");
});

test("one quest instance cannot award XP twice", () => {
  const transactions: XpTransaction[] = [{ id: "tx", questId: "q1", amount: 20, kind: "quest", attributeId: "a", skillId: "s", createdAt: new Date().toISOString() }];
  assert.equal(canAwardQuest("q1", transactions), false);
  assert.equal(canAwardQuest("q2", transactions), true);
});

test("undo reverses only the target quest transaction", () => {
  const transactions: XpTransaction[] = [
    { id: "one", questId: "q1", amount: 20, kind: "quest", attributeId: "a", skillId: "s", createdAt: "2026-01-01", reversedAt: "2026-01-02" },
    { id: "two", questId: "q2", amount: 25, kind: "quest", attributeId: "a", skillId: "s", createdAt: "2026-01-01" },
  ];
  assert.equal(activeXp(transactions), 25);
});

test("deleting an attribute preserves old deleted skills and earned XP", () => {
  const state = makeInitialState();
  state.attributes = [{ id: "a", name: "Intelligence", color: "#866bff", createdAt: "2026-01-01", updatedAt: "2026-01-01" }];
  state.skills = [{ id: "s", attributeId: "a", name: "University", createdAt: "2026-01-01", updatedAt: "2026-02-01", deletedAt: "2026-02-01" }];
  state.transactions = [{ id: "tx", questId: "deleted-q", amount: 40, kind: "quest", attributeId: "a", skillId: "s", createdAt: "2026-01-15" }];

  const next = deleteAttributeFromState(state, "a", "2026-03-01");

  assert.equal(next.attributes[0]?.deletedAt, "2026-03-01");
  assert.equal(next.attributes[0]?.name, "Intelligence");
  assert.equal(next.skills[0]?.name, "University");
  assert.equal(next.skills[0]?.deletedAt, "2026-02-01");
  assert.equal(activeXp(next.transactions), 40);
});

test("deleting an unused attribute removes it and its unused skills completely", () => {
  const state = makeInitialState();
  state.attributes = [{ id: "a", name: "Unused", color: "#866bff", createdAt: "2026-01-01", updatedAt: "2026-01-01" }];
  state.skills = [{ id: "s", attributeId: "a", name: "Unused skill", createdAt: "2026-01-01", updatedAt: "2026-01-01" }];

  const next = deleteAttributeFromState(state, "a", "2026-03-01");

  assert.deepEqual(next.attributes, []);
  assert.deepEqual(next.skills, []);
});

test("recurring quest preserves its AI reward without copying its note or appeal reason", () => {
  const quest: Quest = { id: "q1", title: "Daily", description: "", note: "Review chapter 3", type: "Daily", attributeId: "a", skillId: "s", xp: 30, xpCategory: "growth", focusMinutes: 30, outputBonus: 0, xpSource: "argument", xpArgumentReason: "This was unusually demanding.", date: "2026-07-23T10:00:00.000Z", deadline: "2026-07-23T12:00:00.000Z", recurrence: "daily", difficulty: "Normal", completionConditions: "", failureConsequence: "", status: "completed", createdAt: "2026-07-23", updatedAt: "2026-07-23" };
  const next = nextRecurringInstance(quest, new Date("2026-07-23T13:00:00.000Z"));
  assert.ok(next);
  assert.notEqual(next.id, quest.id);
  assert.equal(next.seriesId, quest.id);
  assert.equal(next.date, "2026-07-24T10:00:00.000Z");
  assert.equal(next.status, "active");
  assert.equal(next.note, undefined);
  assert.equal(next.xp, 30);
  assert.equal(next.xpSource, "argument");
  assert.equal(next.xpArgumentReason, undefined);
});

test("deleting a quest removes its note and content while preserving XP history", () => {
  const state = makeInitialState();
  state.quests = [{ id: "q1", title: "Private task", description: "Private details", note: "Private note", type: "Side", attributeId: "a", skillId: "s", xp: 20, date: "2026-07-23T10:00:00.000Z", deadline: "", recurrence: "none", difficulty: "Normal", completionConditions: "", failureConsequence: "", status: "completed", createdAt: "2026-07-23", updatedAt: "2026-07-23" }];
  state.transactions = [{ id: "tx", questId: "q1", amount: 20, kind: "quest", attributeId: "a", skillId: "s", createdAt: "2026-07-23" }];

  const next = deleteQuestFromState(state, "q1");

  assert.deepEqual(next.quests, []);
  assert.equal(next.transactions.length, 1);
  assert.equal(activeXp(next.transactions), 20);
});

test("server quest mutations change only the targeted quest and preserve XP history", () => {
  const state = makeInitialState();
  state.attributes = [{ id: "a", name: "Intelligence", color: "#866bff", createdAt: "2026-01-01", updatedAt: "2026-01-01" }];
  state.skills = [{ id: "s", attributeId: "a", name: "University", createdAt: "2026-01-01", updatedAt: "2026-01-01" }];
  const first: Quest = { id: "q1", title: "First", description: "", type: "Side", attributeId: "a", skillId: "s", xp: 20, date: "2026-07-23", deadline: "", recurrence: "none", difficulty: "Normal", completionConditions: "", failureConsequence: "", status: "active", createdAt: "client-time", updatedAt: "client-time" };
  const second: Quest = { ...first, id: "q2", title: "Second" };

  const createdFirst = applyQuestMutation(state, { action: "create", quest: first }, "server-1");
  assert.equal(createdFirst.ok, true);
  if (!createdFirst.ok) return;
  assert.equal(Object.hasOwn(createdFirst.state.quests[0], "completedAt"), false);
  const createdSecond = applyQuestMutation(createdFirst.state, { action: "create", quest: second }, "server-2");
  assert.equal(createdSecond.ok, true);
  if (!createdSecond.ok) return;

  const updated = applyQuestMutation(createdSecond.state, { action: "update", quest: { ...first, title: "Updated" } }, "server-3");
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  assert.equal(updated.state.quests.find(quest => quest.id === "q1")?.title, "Updated");
  assert.equal(updated.state.quests.find(quest => quest.id === "q1")?.createdAt, "server-1");
  assert.equal(updated.state.quests.find(quest => quest.id === "q2")?.title, "Second");
  updated.state.transactions = [{ id: "tx", questId: "q1", amount: 20, kind: "quest", attributeId: "a", skillId: "s", createdAt: "server-2" }];

  const deleted = applyQuestMutation(updated.state, { action: "delete", questId: "q1" }, "server-4");
  assert.equal(deleted.ok, true);
  if (!deleted.ok) return;
  assert.equal(deleted.state.quests.some(quest => quest.id === "q1"), false);
  assert.equal(deleted.state.quests.find(quest => quest.id === "q2")?.title, "Second");
  assert.equal(deleted.state.transactions.length, 1);
});

test("server quest validation rejects malformed content and missing relationships", () => {
  const state = makeInitialState();
  const quest = { id: "q", title: "", description: "", type: "Side", attributeId: "a", skillId: "s", xp: 0, date: "2026-07-23", deadline: "", recurrence: "none", difficulty: "Normal", completionConditions: "", failureConsequence: "", status: "active", createdAt: "now", updatedAt: "now" };
  assert.equal(isValidQuest(quest), false);

  const validShape = { ...quest, title: "Valid" } as Quest;
  assert.equal(isValidQuest(validShape), true);
  assert.deepEqual(applyQuestMutation(state, { action: "create", quest: validShape }), { ok: false, code: "invalid_quest" });
});

test("a quest that already awarded XP locks scoring content but still permits notes", () => {
  const state = makeInitialState();
  state.attributes = [{ id: "a", name: "Intelligence", color: "#866bff", createdAt: "now", updatedAt: "now" }];
  state.skills = [{ id: "s", attributeId: "a", name: "University", createdAt: "now", updatedAt: "now" }];
  const quest: Quest = { id: "q", title: "Earned work", description: "", type: "Side", attributeId: "a", skillId: "s", xp: 20, date: "2026-07-23", deadline: "", recurrence: "none", difficulty: "Normal", completionConditions: "Finish", failureConsequence: "", status: "completed", createdAt: "now", updatedAt: "now" };
  state.quests = [quest];
  state.transactions = [{ id: "tx", questId: "q", amount: 20, kind: "quest", attributeId: "a", skillId: "s", createdAt: "now" }];

  assert.deepEqual(
    applyQuestMutation(state, { action: "update", quest: { ...quest, title: "Replaced work" } }),
    { ok: false, code: "earned_quest_locked" },
  );
  const noteUpdate = applyQuestMutation(state, { action: "update", quest: { ...quest, note: "Useful reflection" } }, "later");
  assert.equal(noteUpdate.ok, true);
  if (noteUpdate.ok) assert.equal(noteUpdate.state.quests[0]?.note, "Useful reflection");
});

test("Boss attempts preserve preparation XP and award Boss XP only on the first clear", () => {
  const state = makeInitialState();
  state.attributes = [{ id: "a", name: "Intelligence", color: "#866bff", createdAt: "2026-01-01", updatedAt: "2026-01-01" }];
  state.skills = [{ id: "s", attributeId: "a", name: "University", createdAt: "2026-01-01", updatedAt: "2026-01-01" }];
  const boss: Quest = { id: "boss", title: "Pass exam", description: "", type: "Boss", attributeId: "a", skillId: "s", xp: 300, xpCategory: "boss", xpSource: "ai", date: "2026-07-23", deadline: "", recurrence: "none", difficulty: "Extreme", completionConditions: "Pass", failureConsequence: "", status: "active", createdAt: "now", updatedAt: "now" };
  const step: Quest = { ...boss, id: "step", title: "Master question 1", type: "Side", xp: 20, xpCategory: "growth", parentQuestId: "boss", status: "completed" };
  state.quests = [boss, step];
  state.transactions = [{ id: "step-xp", questId: "step", amount: 20, kind: "quest", attributeId: "a", skillId: "s", createdAt: "now" }];

  const failed = applyQuestMutation(state, { action: "boss_attempt", bossQuestId: "boss", outcome: "failed", result: "Weakness in question 3" }, "attempt-1");
  assert.equal(failed.ok, true);
  if (!failed.ok) return;
  assert.equal(failed.state.quests.find(quest => quest.id === "boss")?.status, "active");
  assert.equal(activeXp(failed.state.transactions), 20);
  assert.equal(failed.state.bossAttempts?.[0]?.outcome, "failed");

  const cleared = applyQuestMutation(failed.state, { action: "boss_attempt", bossQuestId: "boss", outcome: "cleared", result: "Passed with 78%" }, "attempt-2");
  assert.equal(cleared.ok, true);
  if (!cleared.ok) return;
  assert.equal(cleared.state.quests.find(quest => quest.id === "boss")?.status, "completed");
  assert.equal(activeXp(cleared.state.transactions), 320);
  assert.equal(cleared.state.bossAttempts?.length, 2);

  const duplicate = applyQuestMutation(cleared.state, { action: "boss_attempt", bossQuestId: "boss", outcome: "cleared", result: "Duplicate clear" }, "attempt-3");
  assert.deepEqual(duplicate, { ok: false, code: "boss_already_cleared" });
});

test("undoing a Boss clear reverses only Boss XP and reopens steps closed by the clear", () => {
  const state = makeInitialState();
  state.attributes = [{ id: "a", name: "Intelligence", color: "#866bff", createdAt: "2026-01-01", updatedAt: "2026-01-01" }];
  state.skills = [{ id: "s", attributeId: "a", name: "University", createdAt: "2026-01-01", updatedAt: "2026-01-01" }];
  const boss: Quest = { id: "boss", title: "Pass exam", description: "", type: "Boss", attributeId: "a", skillId: "s", xp: 300, date: "2026-07-23", deadline: "", recurrence: "none", difficulty: "Extreme", completionConditions: "Pass", failureConsequence: "", status: "active", createdAt: "now", updatedAt: "now" };
  const step: Quest = { ...boss, id: "step", title: "Timed simulation", type: "Side", xp: 30, parentQuestId: "boss" };
  state.quests = [boss, step];

  const cleared = applyQuestMutation(state, { action: "boss_attempt", bossQuestId: "boss", outcome: "cleared", result: "Passed" }, "clear");
  assert.equal(cleared.ok, true);
  if (!cleared.ok) return;
  assert.equal(cleared.state.quests.find(quest => quest.id === "step")?.status, "archived");
  assert.equal(cleared.state.quests.find(quest => quest.id === "step")?.parentClosedAt, "clear");

  const undone = applyQuestMutation(cleared.state, { action: "undo_boss_clear", bossQuestId: "boss" }, "undo");
  assert.equal(undone.ok, true);
  if (!undone.ok) return;
  assert.equal(undone.state.quests.find(quest => quest.id === "boss")?.status, "active");
  assert.equal(undone.state.quests.find(quest => quest.id === "step")?.status, "active");
  assert.equal(activeXp(undone.state.transactions), 0);
  assert.ok(undone.state.bossAttempts?.[0]?.reversedAt);
});

test("deleting a Boss removes linked preparation and attempt content but preserves XP transactions", () => {
  const state = makeInitialState();
  const boss = { id: "boss", title: "Private exam", description: "Private", type: "Boss", attributeId: "a", skillId: "s", xp: 300, date: "2026-07-23", deadline: "", recurrence: "none", difficulty: "Extreme", completionConditions: "Pass", failureConsequence: "", status: "completed", createdAt: "now", updatedAt: "now" } as Quest;
  const step = { ...boss, id: "step", title: "Private question", type: "Side", parentQuestId: "boss" } as Quest;
  state.quests = [boss, step];
  state.bossAttempts = [{ id: "attempt", bossQuestId: "boss", attemptNumber: 1, outcome: "failed", result: "Private analysis", createdAt: "now" }];
  state.transactions = [{ id: "tx", questId: "step", amount: 20, kind: "quest", attributeId: "a", skillId: "s", createdAt: "now" }];

  const deleted = deleteQuestFromState(state, "boss");
  assert.deepEqual(deleted.quests, []);
  assert.deepEqual(deleted.bossAttempts, []);
  assert.equal(activeXp(deleted.transactions), 20);
});

test("cloud validation rejects duplicate active XP awards and negative XP", () => {
  const state = makeInitialState();
  const transaction: XpTransaction = { id: "tx-1", questId: "q1", amount: 20, kind: "quest", attributeId: "a", skillId: "s", createdAt: "2026-01-01" };
  state.transactions = [transaction, { ...transaction, id: "tx-2" }];
  assert.equal(isValidCloudState(state), false);

  state.transactions = [{ ...transaction, amount: -1 }];
  assert.equal(isValidCloudState(state), false);

  state.transactions = [transaction, { ...transaction, id: "tx-2", reversedAt: "2026-01-02" }];
  assert.equal(isValidCloudState(state), true);

  state.quests = [{ id: "q1", title: "Quest", description: "", note: "x".repeat(501), type: "Side", attributeId: "a", skillId: "s", xp: 20, date: "2026-01-01", deadline: "", recurrence: "none", difficulty: "Normal", completionConditions: "", failureConsequence: "", status: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" }];
  assert.equal(isValidCloudState(state), false);
});

test("cloud normalization repairs MongoDB nulls in optional quest fields", () => {
  const state = makeInitialState();
  state.attributes = [{ id: "a", name: "Intelligence", color: "#866bff", createdAt: "now", updatedAt: "now" }];
  state.skills = [{ id: "s", attributeId: "a", name: "University", createdAt: "now", updatedAt: "now" }];
  state.quests = [{
    id: "q",
    title: "New quest",
    description: "",
    type: "Side",
    attributeId: "a",
    skillId: "s",
    xp: 0,
    date: "2026-07-30",
    deadline: "",
    recurrence: "none",
    difficulty: "Normal",
    completionConditions: "",
    failureConsequence: "",
    status: "active",
    createdAt: "now",
    updatedAt: "now",
    completedAt: null,
  } as unknown as Quest];

  assert.equal(isValidCloudState(state), false);
  const normalized = normalizeCloudState(state);
  assert.ok(normalized);
  assert.equal(isValidCloudState(normalized), true);
  assert.equal(Object.hasOwn(normalized.quests[0], "completedAt"), false);
});

test("AI XP suggestions accept only the fair scale and bounded rationale", () => {
  assert.deepEqual(
    parseXpSuggestion({ xp: 20, category: "growth", confidence: "medium", rationale: "Jedan sat fokusiranog rada." }),
    { xp: 20, category: "growth", confidence: "medium", rationale: "Jedan sat fokusiranog rada." },
  );
  assert.equal(parseXpSuggestion({ xp: 999, category: "boss", confidence: "high", rationale: "Previše." }), null);
  assert.equal(parseXpSuggestion({ xp: 20, category: "growth", confidence: "certain", rationale: "Nevažeće." }), null);
  assert.equal(parseXpSuggestion({ xp: 20, category: "growth", confidence: "low", rationale: "" }), null);
  assert.equal(parseXpSuggestion({ xp: 20, confidence: "high", rationale: "Missing category." }), null);
  assert.deepEqual(
    parseXpSuggestion({ xp: 10, category: "maintenance", confidence: "high", decision: "accepted", rationale: "The selected maintenance tier is justified." }, [0, 5, 10]),
    { xp: 10, category: "maintenance", confidence: "high", decision: "accepted", rationale: "The selected maintenance tier is justified." },
  );
  assert.equal(parseXpSuggestion({ xp: 30, category: "maintenance", confidence: "high", rationale: "Too high for maintenance." }, [0, 5, 10]), null);
});

test("English is the primary UI language and Serbian translations interpolate values", () => {
  assert.equal(translate("en", "dashboard.question2"), "next mission?");
  assert.equal(translate("sr", "dashboard.question2"), "sledeća misija?");
  assert.equal(translate("sr", "dashboard.untilLevel", { xp: 80, level: 2 }), "80 XP do Levela 2");
  assert.equal(translate("en", "auth.deniedTitle"), "This system serves its owner");
  assert.equal(translate("sr", "auth.deniedText"), "Nemaš pristup ovom WeAscend sistemu.");
});

test("owner allowlist distinguishes missing, wrong and authorized accounts", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousOwnerEmail = process.env.OWNER_EMAIL;
  process.env.NODE_ENV = "production";
  process.env.OWNER_EMAIL = "owner@example.com";

  try {
    assert.equal(authenticateRequest(new Request("https://wesolo.example/api/state")).status, "unauthenticated");
    assert.equal(
      authenticateRequest(new Request("https://wesolo.example/api/state", {
        headers: { "oai-authenticated-user-email": "other@example.com" },
      })).status,
      "forbidden",
    );

    const owner = authenticateRequest(new Request("https://wesolo.example/api/state", {
      headers: { "oai-authenticated-user-email": " OWNER@example.com " },
    }));
    assert.equal(owner.status, "authenticated");
    if (owner.status === "authenticated") assert.equal(owner.user.email, "owner@example.com");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousOwnerEmail === undefined) delete process.env.OWNER_EMAIL;
    else process.env.OWNER_EMAIL = previousOwnerEmail;
  }
});
