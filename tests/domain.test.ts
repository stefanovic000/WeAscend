import test from "node:test";
import assert from "node:assert/strict";
import { activeXp, canAwardQuest, defaultSettings, deleteAttributeFromState, isValidCloudState, makeInitialState, nextRecurringInstance, progressFromXp, rankForLevel, type Quest, type XpTransaction } from "../app/domain.ts";
import { translate } from "../app/i18n.ts";
import { parseXpSuggestion } from "../app/xpAdvisor.ts";

test("initial state is completely empty at level 1 with zero XP", () => {
  const state = makeInitialState();
  assert.equal(activeXp(state.transactions), 0);
  assert.equal(progressFromXp(0, state.settings).level, 1);
  assert.deepEqual(state.attributes, []);
  assert.deepEqual(state.skills, []);
  assert.deepEqual(state.quests, []);
  assert.deepEqual(state.bosses, []);
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

test("recurring quest creates a separate dated instance", () => {
  const quest: Quest = { id: "q1", title: "Daily", description: "", type: "Daily", attributeId: "a", skillId: "s", xp: 10, date: "2026-07-23T10:00:00.000Z", deadline: "2026-07-23T12:00:00.000Z", recurrence: "daily", difficulty: "Normal", completionConditions: "", failureConsequence: "", status: "completed", createdAt: "2026-07-23", updatedAt: "2026-07-23" };
  const next = nextRecurringInstance(quest, new Date("2026-07-23T13:00:00.000Z"));
  assert.ok(next);
  assert.notEqual(next.id, quest.id);
  assert.equal(next.seriesId, quest.id);
  assert.equal(next.date, "2026-07-24T10:00:00.000Z");
  assert.equal(next.status, "active");
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
});

test("AI XP suggestions accept only the fair scale and bounded rationale", () => {
  assert.deepEqual(
    parseXpSuggestion({ xp: 20, confidence: "medium", rationale: "Jedan sat fokusiranog rada." }),
    { xp: 20, confidence: "medium", rationale: "Jedan sat fokusiranog rada." },
  );
  assert.equal(parseXpSuggestion({ xp: 999, confidence: "high", rationale: "Previše." }), null);
  assert.equal(parseXpSuggestion({ xp: 20, confidence: "certain", rationale: "Nevažeće." }), null);
  assert.equal(parseXpSuggestion({ xp: 20, confidence: "low", rationale: "" }), null);
});

test("English is the primary UI language and Serbian translations interpolate values", () => {
  assert.equal(translate("en", "dashboard.question2"), "next mission?");
  assert.equal(translate("sr", "dashboard.question2"), "sledeća misija?");
  assert.equal(translate("sr", "dashboard.untilLevel", { xp: 80, level: 2 }), "80 XP do Levela 2");
});
