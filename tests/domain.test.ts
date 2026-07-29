import test from "node:test";
import assert from "node:assert/strict";
import { activeXp, applyQuestMutation, calculateQuestXp, canAwardQuest, defaultSettings, deleteAttributeFromState, deleteQuestFromState, isValidCloudState, isValidQuest, makeInitialState, nextRecurringInstance, progressFromXp, rankForLevel, type Quest, type XpTransaction } from "../app/domain.ts";
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
  const createdSecond = applyQuestMutation(createdFirst.state, { action: "create", quest: second }, "server-2");
  assert.equal(createdSecond.ok, true);
  if (!createdSecond.ok) return;
  createdSecond.state.transactions = [{ id: "tx", questId: "q1", amount: 20, kind: "quest", attributeId: "a", skillId: "s", createdAt: "server-2" }];

  const updated = applyQuestMutation(createdSecond.state, { action: "update", quest: { ...first, title: "Updated" } }, "server-3");
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  assert.equal(updated.state.quests.find(quest => quest.id === "q1")?.title, "Updated");
  assert.equal(updated.state.quests.find(quest => quest.id === "q1")?.createdAt, "server-1");
  assert.equal(updated.state.quests.find(quest => quest.id === "q2")?.title, "Second");

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
