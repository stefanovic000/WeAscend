import { resolvePlan } from "../app/plan";
import type { UserDocument } from "./mongo";

type StoredPlan = Pick<UserDocument, "plan" | "planSource" | "planExpiresAt"> | null | undefined;

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function publicPlanForUser(user: StoredPlan) {
  return resolvePlan(user, {
    betaPremium: enabled(process.env.PREMIUM_BETA_ACCESS),
    limitsEnforced: enabled(process.env.AI_LIMITS_ENABLED),
  });
}
