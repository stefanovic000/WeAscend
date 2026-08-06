import test from "node:test";
import assert from "node:assert/strict";
import { activeXp, addTemplateQuestForDate, applyQuestMutation, calculateQuestXp, canAwardQuest, defaultSettings, deleteAttributeFromState, deleteQuestFromState, isValidCloudState, isValidQuest, makeInitialState, materializeRoutineInstances, nextRecurringInstance, normalizeCloudState, progressFromXp, questTemplateFromQuest, rankForLevel, type Quest, type QuestTemplate, type XpTransaction } from "../app/domain.ts";
import { translate } from "../app/i18n.ts";
import { applyBossPreparationFloor, parseXpSuggestion } from "../app/xpAdvisor.ts";
import { authenticateRequest, authenticateRequestAllowUnverified } from "../server/auth.ts";
import { buildAuthEmail, buildCustomActionUrl } from "../server/authEmail.ts";
import { toLocalDateTimeValue, toStoredDateTime } from "../app/dateTime.ts";
import { detectBossStepLanguage, parseBossStepPlan } from "../app/bossStepPlanner.ts";

test("initial state is completely empty at level 1 with zero XP", () => {
  const state = makeInitialState();
  assert.equal(activeXp(state.transactions), 0);
  assert.equal(progressFromXp(0, state.settings).level, 1);
  assert.deepEqual(state.attributes, []);
  assert.deepEqual(state.skills, []);
  assert.deepEqual(state.quests, []);
  assert.deepEqual(state.bosses, []);
  assert.equal(state.settings.manualXpOverride, false);
  assert.equal(state.settings.tutorialCompleted, false);
});

test("quest date input preserves typed local values and stores a valid instant", () => {
  const typed = "2026-07-30T14:05";
  assert.equal(toLocalDateTimeValue(typed), typed);
  assert.equal(toStoredDateTime(typed), new Date(typed).toISOString());

  const localDate = new Date(2026, 6, 30, 9, 7);
  assert.equal(toLocalDateTimeValue(localDate.toISOString()), "2026-07-30T09:07");
  assert.equal(toLocalDateTimeValue("2026-07-30"), "2026-07-30T09:00");
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

test("quest templates omit private notes and create at most one independent instance per day", () => {
  const state = makeInitialState();
  state.attributes = [{ id: "a", name: "Strength", color: "#866bff", createdAt: "now", updatedAt: "now" }];
  state.skills = [{ id: "s", attributeId: "a", name: "Gym", createdAt: "now", updatedAt: "now" }];
  const quest: Quest = { id: "q", title: "Upper body", description: "Training plan", note: "Private note", type: "Daily", attributeId: "a", skillId: "s", xp: 25, xpSource: "ai", date: "2026-08-01T08:00:00.000Z", deadline: "2026-08-01T09:30:00.000Z", recurrence: "daily", difficulty: "Hard", completionConditions: "Finish all sets", failureConsequence: "", status: "active", createdAt: "now", updatedAt: "now" };
  const template = questTemplateFromQuest(quest, "stamp");
  assert.ok(template);
  if (!template) return;
  assert.equal(Object.hasOwn(template, "note"), false);
  template.schedule = "daily";
  template.startDate = "2026-08-01";
  state.questTemplates = [template];
  state.quests = [quest];

  const sourceDay = materializeRoutineInstances(state, new Date(2026, 7, 1, 12), "source");
  const first = materializeRoutineInstances(state, new Date(2026, 7, 2, 12), "first");
  const duplicate = materializeRoutineInstances(first, new Date(2026, 7, 2, 18), "duplicate");
  const nextDay = materializeRoutineInstances(duplicate, new Date(2026, 7, 3, 12), "second");

  assert.equal(sourceDay.quests.length, 1);
  assert.equal(first.quests.length, 2);
  assert.equal(duplicate.quests.length, 2);
  assert.equal(nextDay.quests.length, 3);
  assert.equal(nextDay.quests[0]?.recurrence, "none");
  assert.notEqual(nextDay.quests[0]?.id, nextDay.quests[1]?.id);
});

test("weekly routines use selected weekdays and manual template use is idempotent", () => {
  const state = makeInitialState();
  state.attributes = [{ id: "a", name: "Strength", color: "#866bff", createdAt: "now", updatedAt: "now" }];
  state.skills = [{ id: "s", attributeId: "a", name: "Gym", createdAt: "now", updatedAt: "now" }];
  const template: QuestTemplate = { id: "template", title: "Gym", description: "", type: "Daily", attributeId: "a", skillId: "s", xp: 20, difficulty: "Normal", completionConditions: "Done", failureConsequence: "", schedule: "weekly", weekdays: [1, 4], startDate: "2026-08-01", time: "09:00", deadlineOffsetMinutes: 60, createdAt: "now", updatedAt: "now" };
  state.questTemplates = [template];

  const sunday = materializeRoutineInstances(state, new Date(2026, 7, 2, 12));
  const monday = materializeRoutineInstances(sunday, new Date(2026, 7, 3, 12));
  const manual = addTemplateQuestForDate(monday, template.id, "2026-08-04");
  const manualAgain = addTemplateQuestForDate(manual, template.id, "2026-08-04");

  assert.equal(sunday.quests.length, 0);
  assert.equal(monday.quests.length, 1);
  assert.equal(manual.quests.length, 2);
  assert.equal(manualAgain.quests.length, 2);
  assert.equal(isValidCloudState(manualAgain), true);
});

test("Every N days routines use their start date as an anchor without backfilling missed days", () => {
  const state = makeInitialState();
  state.attributes = [{ id: "a", name: "Strength", color: "#866bff", createdAt: "now", updatedAt: "now" }];
  state.skills = [{ id: "s", attributeId: "a", name: "Gym", createdAt: "now", updatedAt: "now" }];
  const template: QuestTemplate = { id: "interval", title: "Mobility", description: "", type: "Daily", attributeId: "a", skillId: "s", xp: 10, difficulty: "Easy", completionConditions: "Done", failureConsequence: "", schedule: "interval", intervalDays: 2, weekdays: [], startDate: "2026-08-01", time: "09:00", deadlineOffsetMinutes: 90, createdAt: "now", updatedAt: "now" };
  state.questTemplates = [template];

  const first = materializeRoutineInstances(state, new Date(2026, 7, 1, 12), "first");
  const skipped = materializeRoutineInstances(first, new Date(2026, 7, 2, 12), "skipped");
  const third = materializeRoutineInstances(skipped, new Date(2026, 7, 3, 12), "third");

  assert.equal(first.quests.length, 1);
  assert.equal(skipped.quests.length, 1);
  assert.equal(third.quests.length, 2);
  assert.deepEqual(third.quests.map(quest => quest.routineDate).sort(), ["2026-08-01", "2026-08-03"]);
  assert.equal(third.quests.find(quest => quest.routineDate === "2026-08-03")?.deadline, new Date(2026, 7, 3, 10, 30).toISOString());
});

test("editing a template changes only future instances", () => {
  const state = makeInitialState();
  state.attributes = [{ id: "a", name: "Strength", color: "#866bff", createdAt: "now", updatedAt: "now" }];
  state.skills = [{ id: "s", attributeId: "a", name: "Gym", createdAt: "now", updatedAt: "now" }];
  const template: QuestTemplate = { id: "editable", title: "Old routine", description: "", type: "Daily", attributeId: "a", skillId: "s", xp: 20, xpSource: "ai", difficulty: "Normal", completionConditions: "Old condition", failureConsequence: "", schedule: "daily", weekdays: [], startDate: "2026-08-01", time: "09:00", deadlineOffsetMinutes: 60, createdAt: "now", updatedAt: "now" };
  state.questTemplates = [template];

  const first = materializeRoutineInstances(state, new Date(2026, 7, 2, 12), "first");
  first.questTemplates = [{ ...template, title: "Updated routine", xp: 30, completionConditions: "New condition", updatedAt: "edited" }];
  const second = materializeRoutineInstances(first, new Date(2026, 7, 3, 12), "second");

  const oldInstance = second.quests.find(quest => quest.routineDate === "2026-08-02");
  const newInstance = second.quests.find(quest => quest.routineDate === "2026-08-03");
  assert.equal(oldInstance?.title, "Old routine");
  assert.equal(oldInstance?.xp, 20);
  assert.equal(oldInstance?.completionConditions, "Old condition");
  assert.equal(newInstance?.title, "Updated routine");
  assert.equal(newInstance?.xp, 30);
  assert.equal(newInstance?.completionConditions, "New condition");
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

test("generated Boss preparation steps are created atomically and reject duplicates", () => {
  const state = makeInitialState();
  state.attributes = [{ id: "a", name: "Intelligence", color: "#866bff", createdAt: "now", updatedAt: "now" }];
  state.skills = [{ id: "s", attributeId: "a", name: "University", createdAt: "now", updatedAt: "now" }];
  const boss: Quest = { id: "boss", title: "Exam", description: "", type: "Boss", attributeId: "a", skillId: "s", xp: 300, date: "2026-08-10", deadline: "", recurrence: "none", difficulty: "Extreme", completionConditions: "Pass", failureConsequence: "", status: "active", createdAt: "now", updatedAt: "now" };
  const step: Quest = { ...boss, id: "step-1", title: "Question 1", type: "Side", xp: 20, xpCategory: "growth", xpSource: "ai", parentQuestId: "boss", stepOrder: 0 };
  const second: Quest = { ...step, id: "step-2", title: "Question 2", stepOrder: 1 };
  state.quests = [boss];

  const created = applyQuestMutation(state, { action: "create_many", quests: [step, second] }, "server-time");
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.state.quests.filter(quest => quest.parentQuestId === "boss").length, 2);
  assert.equal(created.state.quests.find(quest => quest.id === "step-1")?.createdAt, "server-time");

  const duplicate = applyQuestMutation(created.state, {
    action: "create_many",
    quests: [{ ...step, id: "step-3", title: " question 1 " }],
  });
  assert.deepEqual(duplicate, { ok: false, code: "invalid_quest" });
  assert.equal(created.state.quests.some(quest => quest.id === "step-3"), false);
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

test("archiving and restoring returns a quest to its exact previous status without changing XP", () => {
  const state = makeInitialState();
  state.attributes = [{ id: "a", name: "Intelligence", color: "#866bff", createdAt: "now", updatedAt: "now" }];
  state.skills = [{ id: "s", attributeId: "a", name: "University", createdAt: "now", updatedAt: "now" }];
  const quest: Quest = { id: "q", title: "Passed exam", description: "", type: "Side", attributeId: "a", skillId: "s", xp: 30, date: "2026-07-23", deadline: "", recurrence: "none", difficulty: "Hard", completionConditions: "Pass", failureConsequence: "", status: "completed", completedAt: "done", createdAt: "now", updatedAt: "now" };
  state.quests = [quest];
  state.transactions = [{ id: "tx", questId: "q", amount: 30, kind: "quest", attributeId: "a", skillId: "s", createdAt: "done" }];

  const archived = applyQuestMutation(state, { action: "update", quest: { ...quest, status: "archived", archivedFromStatus: "completed" } }, "archive");
  assert.equal(archived.ok, true);
  if (!archived.ok) return;
  assert.equal(archived.state.quests[0]?.status, "archived");
  assert.equal(archived.state.quests[0]?.archivedFromStatus, "completed");
  assert.equal(activeXp(archived.state.transactions), 30);

  const archivedQuest = archived.state.quests[0];
  assert.ok(archivedQuest);
  const restored = applyQuestMutation(archived.state, { action: "update", quest: { ...archivedQuest, status: archivedQuest.archivedFromStatus ?? "active", archivedFromStatus: undefined } }, "restore");
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.state.quests[0]?.status, "completed");
  assert.equal(restored.state.quests[0]?.archivedFromStatus, undefined);
  assert.equal(activeXp(restored.state.transactions), 30);
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

test("bounded Boss preparation cannot receive zero only because details are brief", () => {
  const zero: ReturnType<typeof parseXpSuggestion> = {
    xp: 0,
    category: "growth",
    confidence: "low",
    decision: "estimate",
    rationale: "Duration is not stated.",
  };

  assert.equal(applyBossPreparationFloor(zero, {
    isBossPreparation: true,
    activity: "productive",
    language: "en",
  }).xp, 10);
  assert.equal(applyBossPreparationFloor(zero, {
    isBossPreparation: true,
    activity: "unclear",
    language: "sr",
  }).xp, 10);
  assert.equal(applyBossPreparationFloor(zero, {
    isBossPreparation: true,
    activity: "nonproductive",
    language: "en",
  }).xp, 0);
  assert.equal(applyBossPreparationFloor(zero, {
    isBossPreparation: false,
    activity: "productive",
    language: "en",
  }).xp, 0);
});

test("AI Boss-step plans validate XP, dates, and existing-title duplicates", () => {
  const plan = parseBossStepPlan({
    steps: [
      { title: "Question 1", description: "Learn and solve it.", completionConditions: "Solve without notes.", date: "2026-08-01", xp: 20, rationale: "A substantial focused unit." },
      { title: "Question 2", description: "Learn and solve it.", completionConditions: "Solve without notes.", date: "2026-08-02", xp: 20, rationale: "A substantial focused unit." },
    ],
  }, ["Question 1"]);
  assert.deepEqual(plan?.map(step => step.title), ["Question 2"]);
  assert.equal(parseBossStepPlan({
    steps: [{ title: "Bad date", description: "", completionConditions: "Done", date: "2026-02-31", xp: 20, rationale: "Invalid." }],
  }), null);
  assert.equal(parseBossStepPlan({
    steps: [{ title: "Inflated", description: "", completionConditions: "Done", date: "2026-08-01", xp: 100, rationale: "Too much." }],
  }), null);
});

test("Boss-step generator detects Serbian instructions independently of UI language", () => {
  assert.equal(detectBossStepLanguage("Napravi po jedan korak za svih 5 ispitnih zadataka", "en"), "sr");
  assert.equal(detectBossStepLanguage("Generisi pitanja za ucenje bez gledanja resenja", "en"), "sr");
  assert.equal(detectBossStepLanguage("Create one preparation step for each exam question", "sr"), "en");
  assert.equal(detectBossStepLanguage("5 × OE1", "sr"), "sr");
  assert.equal(detectBossStepLanguage("5 × OE1", "en"), "en");
});

test("English is the primary UI language and Serbian translations interpolate values", () => {
  assert.equal(translate("en", "dashboard.question2"), "next mission?");
  assert.equal(translate("sr", "dashboard.question2"), "sledeća misija?");
  assert.equal(translate("sr", "dashboard.untilLevel", { xp: 80, level: 2 }), "80 XP do Levela 2");
  assert.equal(translate("en", "auth.deniedTitle"), "This system serves its owner");
  assert.equal(translate("sr", "auth.deniedText"), "Nemaš pristup ovom WeAscend sistemu.");
});

test("Firebase authentication requires a verified token and preserves distinct stable user IDs", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousProjectId = process.env.FIREBASE_PROJECT_ID;
  process.env.NODE_ENV = "production";
  process.env.FIREBASE_PROJECT_ID = "weascend-test";

  try {
    const missing = await authenticateRequest(new Request("https://weascend.example/api/state"));
    assert.equal(missing.status, "unauthenticated");

    const tokenRequest = (token: string) => new Request("https://weascend.example/api/state", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const verifier = async (token: string) => ({
      sub: token === "first" ? "firebase-user-1" : "firebase-user-2",
      email: token === "first" ? "first@example.com" : "second@example.com",
      name: token === "first" ? "First" : "Second",
      email_verified: token !== "unverified",
      auth_time: Math.floor(Date.now() / 1000) - 5,
    });

    const first = await authenticateRequest(tokenRequest("first"), verifier);
    const second = await authenticateRequest(tokenRequest("second"), verifier);
    const unverified = await authenticateRequest(tokenRequest("unverified"), verifier);
    const missingEmail = await authenticateRequest(tokenRequest("missing-email"), async () => ({
      sub: "firebase-user-3",
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000) - 5,
    }));
    const invalid = await authenticateRequest(tokenRequest("invalid"), async () => {
      throw new Error("invalid token");
    });

    assert.equal(first.status, "authenticated");
    assert.equal(second.status, "authenticated");
    assert.equal(unverified.status, "forbidden");
    assert.equal(missingEmail.status, "unauthenticated");
    assert.equal(invalid.status, "unauthenticated");
    if (first.status === "authenticated" && second.status === "authenticated") {
      assert.equal(first.user.id, "firebase-user-1");
      assert.equal(first.user.email, "first@example.com");
      assert.notEqual(first.user.id, second.user.id);
    }
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousProjectId === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = previousProjectId;
  }
});

test("the email-only endpoint can authenticate an unverified Firebase user without weakening normal APIs", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousProjectId = process.env.FIREBASE_PROJECT_ID;
  process.env.NODE_ENV = "production";
  process.env.FIREBASE_PROJECT_ID = "weascend-test";
  const request = new Request("https://weascend.example/api/auth/email", {
    headers: { Authorization: "Bearer unverified" },
  });
  const verifier = async () => ({
    sub: "firebase-user-unverified",
    email: "new@example.com",
    email_verified: false,
    auth_time: Math.floor(Date.now() / 1000) - 5,
  });

  try {
    const normal = await authenticateRequest(request, verifier);
    const emailOnly = await authenticateRequestAllowUnverified(request, verifier);
    assert.equal(normal.status, "forbidden");
    assert.equal(emailOnly.status, "authenticated");
    if (emailOnly.status === "authenticated") {
      assert.equal(emailOnly.user.id, "firebase-user-unverified");
      assert.equal(emailOnly.user.emailVerified, false);
    }
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousProjectId === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = previousProjectId;
  }
});

test("custom auth emails use the fixed WeAscend action page and provide HTML plus plain text", () => {
  const url = buildCustomActionUrl("https://weascend.example/ignored?bad=1", "verification", "code + symbols", "sr");
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://weascend.example");
  assert.equal(parsed.pathname, "/email-action");
  assert.equal(parsed.searchParams.get("mode"), "verifyEmail");
  assert.equal(parsed.searchParams.get("oobCode"), "code + symbols");
  assert.equal(parsed.searchParams.get("lang"), "sr");

  const email = buildAuthEmail("verification", "sr", url);
  assert.match(email.subject, /Potvrdi email/);
  assert.match(email.html, /WeAscend/);
  assert.match(email.html, /Potvrdi email/);
  assert.match(email.text, /https:\/\/weascend\.example\/email-action/);
});
