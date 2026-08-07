export type PlanName = "free" | "premium";
export type PlanSource = "free" | "beta_grant" | "promotion" | "web" | "google_play";

export type PlanLimits = {
  xpEstimates: number;
  xpArguments: number;
  bossPlans: number;
};

export type PlanOverview = {
  name: PlanName;
  source: PlanSource;
  complimentary: boolean;
  limits: PlanLimits;
  limitsEnforced: boolean;
  billingEnabled: boolean;
};

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: { xpEstimates: 15, xpArguments: 15, bossPlans: 1 },
  premium: { xpEstimates: 150, xpArguments: 100, bossPlans: 10 },
};

export const FREE_PLAN: PlanOverview = {
  name: "free",
  source: "free",
  complimentary: false,
  limits: PLAN_LIMITS.free,
  limitsEnforced: false,
  billingEnabled: false,
};

export type StoredPlanAccess = {
  plan?: PlanName;
  planSource?: PlanSource;
  planExpiresAt?: Date;
} | null | undefined;

export function resolvePlan(
  stored: StoredPlanAccess,
  options: { betaPremium: boolean; limitsEnforced: boolean; now?: Date },
): PlanOverview {
  const now = options.now ?? new Date();
  const storedPremiumActive = stored?.plan === "premium"
    && (!stored.planExpiresAt || stored.planExpiresAt.getTime() > now.getTime());
  const name: PlanName = storedPremiumActive || options.betaPremium ? "premium" : "free";
  const source: PlanSource = storedPremiumActive
    ? stored?.planSource ?? "promotion"
    : options.betaPremium
      ? "beta_grant"
      : "free";

  return {
    ...FREE_PLAN,
    name,
    source,
    complimentary: source === "beta_grant" || source === "promotion",
    limits: PLAN_LIMITS[name],
    limitsEnforced: options.limitsEnforced,
  };
}
