import { useCallback, type PropsWithChildren } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { useOnboarding } from "@/providers/OnboardingProvider";

type OnboardingTargetProps = PropsWithChildren<{
  targetId: string;
  style?: StyleProp<ViewStyle>;
}>;

export function OnboardingTarget({ children, targetId, style }: OnboardingTargetProps) {
  const { registerTarget } = useOnboarding();
  const targetRef = useCallback((node: View | null) => registerTarget(targetId, node), [registerTarget, targetId]);
  return <View collapsable={false} ref={targetRef} style={style}>{children}</View>;
}
