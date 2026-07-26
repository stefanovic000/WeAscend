export const FAIR_XP_VALUES = [0, 5, 10, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400] as const;

export type XpConfidence = "low" | "medium" | "high";

export type XpSuggestion = {
  xp: number;
  confidence: XpConfidence;
  rationale: string;
};

export function parseXpSuggestion(value: unknown): XpSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const xp = Number(candidate.xp);
  const confidence = candidate.confidence;
  const rationale = typeof candidate.rationale === "string" ? candidate.rationale.trim() : "";

  if (!FAIR_XP_VALUES.includes(xp as (typeof FAIR_XP_VALUES)[number])) return null;
  if (confidence !== "low" && confidence !== "medium" && confidence !== "high") return null;
  if (!rationale || rationale.length > 320) return null;

  return { xp, confidence, rationale };
}
