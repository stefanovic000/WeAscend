import { CONTENT_LIMITS } from "./domain.ts";

const STEP_XP_VALUES = [10, 15, 20, 25, 30] as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const SERBIAN_MARKERS = new Set([
  "napravi", "napraviti", "generisi", "generisati", "zadatak", "zadatka", "zadatke", "zadataka",
  "ispit", "ispita", "ispitni", "pitanje", "pitanja", "oblast", "oblasti", "korak", "koraka",
  "korake", "ucenje", "nauci", "nauciti", "resi", "resiti", "vezba", "vezbanje", "priprema",
  "pripremu", "svaki", "svakog", "podeli", "lekcija", "gradivo",
]);
const ENGLISH_MARKERS = new Set([
  "create", "make", "generate", "task", "tasks", "exam", "question", "questions", "topic", "topics",
  "step", "steps", "study", "learn", "solve", "practice", "preparation", "each", "split", "chapter",
]);

export interface BossStepSuggestion {
  title: string;
  description: string;
  completionConditions: string;
  date: string;
  xp: number;
  rationale: string;
}

const text = (value: unknown, max: number, required = false) => {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, max);
  return required && !cleaned ? null : cleaned;
};

const titleKey = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

export function detectBossStepLanguage(instruction: string, fallback: "en" | "sr") {
  const words = instruction.toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z]+/g) ?? [];
  const serbianScore = words.reduce((score, word) => score + (SERBIAN_MARKERS.has(word) ? 1 : 0), 0);
  const englishScore = words.reduce((score, word) => score + (ENGLISH_MARKERS.has(word) ? 1 : 0), 0);
  if (serbianScore > englishScore) return "sr" as const;
  if (englishScore > serbianScore) return "en" as const;
  return fallback;
}

function validDate(value: string) {
  if (!DATE_ONLY.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10));
}

export function parseBossStepPlan(value: unknown, existingTitles: string[] = []): BossStepSuggestion[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { steps?: unknown }).steps)) return null;
  const rawSteps = (value as { steps: unknown[] }).steps;
  if (rawSteps.length < 1 || rawSteps.length > 12) return null;

  const seen = new Set(existingTitles.map(titleKey));
  const steps: BossStepSuggestion[] = [];
  for (const raw of rawSteps) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const title = text(item.title, CONTENT_LIMITS.questTitle, true);
    const description = text(item.description, 1_500);
    const completionConditions = text(item.completionConditions, 500, true);
    const date = text(item.date, 10, true);
    const rationale = text(item.rationale, 240, true);
    const xp = Number(item.xp);
    if (!title || description === null || !completionConditions || !date || !validDate(date) || !rationale ||
      !(STEP_XP_VALUES as readonly number[]).includes(xp)) return null;
    const key = titleKey(title);
    if (seen.has(key)) continue;
    seen.add(key);
    steps.push({ title, description, completionConditions, date, xp, rationale });
  }

  return steps.length ? steps : null;
}
