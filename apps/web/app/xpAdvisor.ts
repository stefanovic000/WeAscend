import type { XpCategory } from "./domain";

export const FAIR_XP_VALUES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 75, 100, 150, 200, 300, 400] as const;

export type XpConfidence = "low" | "medium" | "high";

export type XpSuggestion = {
  xp: number;
  category: XpCategory;
  confidence: XpConfidence;
  rationale: string;
  decision?: "estimate" | "accepted" | "adjusted" | "rejected";
};

export type XpActivityAssessment = "productive" | "nonproductive" | "unclear";

export function applyBossPreparationFloor(
  suggestion: XpSuggestion,
  context: { isBossPreparation: boolean; activity: XpActivityAssessment; language: "en" | "sr" },
): XpSuggestion {
  if (!context.isBossPreparation || suggestion.xp !== 0 || context.activity === "nonproductive") return suggestion;

  return {
    xp: 10,
    category: "growth",
    confidence: "low",
    decision: "estimate",
    rationale: context.language === "sr"
      ? "Priprema za Boss je konkretna jedinica učenja; bez navedenog trajanja dobija konzervativnih 10 XP."
      : "Boss preparation is a concrete study unit; without a stated duration it receives a conservative 10 XP.",
  };
}

export function parseXpSuggestion(value: unknown, allowedXp: readonly number[] = FAIR_XP_VALUES): XpSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const xp = Number(candidate.xp);
  const category = candidate.category;
  const confidence = candidate.confidence;
  const rationale = typeof candidate.rationale === "string" ? candidate.rationale.trim() : "";
  const decision = candidate.decision;

  if (!allowedXp.includes(xp)) return null;
  if (category !== "growth" && category !== "maintenance" && category !== "result" && category !== "boss") return null;
  if (confidence !== "low" && confidence !== "medium" && confidence !== "high") return null;
  if (!rationale || rationale.length > 320) return null;

  if (decision !== undefined && decision !== "estimate" && decision !== "accepted" && decision !== "adjusted" && decision !== "rejected") return null;

  return { xp, category, confidence, rationale, ...(decision ? { decision } : {}) };
}
