import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import type { View } from "react-native";

import { useAuth } from "@/providers/AuthProvider";

const TOUR_VERSION = 7;
const TOTAL_STEPS = 5;

export type OnboardingTargetRect = { x: number; y: number; width: number; height: number };

type OnboardingContextValue = {
  active: boolean;
  checklistRequested: boolean;
  step: number;
  totalSteps: number;
  next: () => void;
  back: () => void;
  skip: () => void;
  restart: () => void;
  showChecklist: () => void;
  dismissChecklist: () => void;
  registerTarget: (targetId: string, node: View | null) => void;
  measureTarget: (targetId: string) => Promise<OnboardingTargetRect | null>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function storageKey(userId: string) {
  return `@weascend/mobile-onboarding-v${TOUR_VERSION}:${userId}`;
}

export function OnboardingProvider({ children }: PropsWithChildren) {
  const { identity } = useAuth();
  const [active, setActive] = useState(false);
  const [checklistRequested, setChecklistRequested] = useState(false);
  const [step, setStep] = useState(0);
  const targets = useRef(new Map<string, View>());

  useEffect(() => {
    const userId = identity?.emailVerified ? identity.id : null;
    let cancelled = false;
    setActive(false);
    setChecklistRequested(false);
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

  const registerTarget = useCallback((targetId: string, node: View | null) => {
    if (node) targets.current.set(targetId, node);
    else targets.current.delete(targetId);
  }, []);

  const measureTarget = useCallback((targetId: string) => new Promise<OnboardingTargetRect | null>(resolve => {
    const target = targets.current.get(targetId);
    if (!target) {
      resolve(null);
      return;
    }
    target.measureInWindow((x, y, width, height) => {
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  }), []);

  const value = useMemo<OnboardingContextValue>(() => ({
    active,
    checklistRequested,
    step,
    totalSteps: TOTAL_STEPS,
    next,
    back: () => setStep(current => Math.max(0, current - 1)),
    skip: complete,
    restart: () => {
      setStep(0);
      setActive(true);
    },
    showChecklist: () => setChecklistRequested(true),
    dismissChecklist: () => setChecklistRequested(false),
    registerTarget,
    measureTarget,
  }), [active, checklistRequested, complete, measureTarget, next, registerTarget, step]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error("useOnboarding must be used inside OnboardingProvider");
  return value;
}
