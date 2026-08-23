import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { useAuth } from "@/providers/AuthProvider";

const TOUR_VERSION = 1;
const TOTAL_STEPS = 5;

type OnboardingContextValue = {
  active: boolean;
  step: number;
  totalSteps: number;
  next: () => void;
  back: () => void;
  skip: () => void;
  restart: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function storageKey(userId: string) {
  return `@weascend/mobile-onboarding-v${TOUR_VERSION}:${userId}`;
}

export function OnboardingProvider({ children }: PropsWithChildren) {
  const { identity } = useAuth();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const userId = identity?.emailVerified ? identity.id : null;
    let cancelled = false;
    setActive(false);
    setStep(0);
    if (!userId) return () => { cancelled = true; };

    void AsyncStorage.getItem(storageKey(userId)).then(value => {
      if (!cancelled && value !== "completed") setActive(true);
    });
    return () => { cancelled = true; };
  }, [identity?.emailVerified, identity?.id]);

  const complete = useCallback(() => {
    const userId = identity?.id;
    setActive(false);
    setStep(0);
    if (userId) void AsyncStorage.setItem(storageKey(userId), "completed");
  }, [identity?.id]);

  const next = useCallback(() => {
    if (step >= TOTAL_STEPS - 1) complete();
    else setStep(step + 1);
  }, [complete, step]);

  const value = useMemo<OnboardingContextValue>(() => ({
    active,
    step,
    totalSteps: TOTAL_STEPS,
    next,
    back: () => setStep(current => Math.max(0, current - 1)),
    skip: complete,
    restart: () => {
      setStep(0);
      setActive(true);
    },
  }), [active, complete, next, step]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error("useOnboarding must be used inside OnboardingProvider");
  return value;
}
