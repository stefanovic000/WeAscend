import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radius, spacing } from "@/theme";

type PrimaryButtonProps = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  disabled?: boolean;
};

export function PrimaryButton({ label, icon = "add", onPress, disabled }: PrimaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Ionicons color={colors.text} name={icon} size={20} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.violet,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    backgroundColor: colors.border,
    opacity: 0.65,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
});
