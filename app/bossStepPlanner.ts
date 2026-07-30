const STEP_XP_VALUES = [10, 15, 20, 25, 30] as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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
    const title = text(item.title, 180, true);
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
