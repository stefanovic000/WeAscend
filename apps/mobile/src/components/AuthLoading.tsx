import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme";

export function AuthLoading() {
  return (
    <View style={styles.container}>
      <View style={styles.emblem}>
        <Text style={styles.mark}>W</Text>
      </View>
      <ActivityIndicator color={colors.violetSoft} size="small" />
      <Text style={styles.label}>CONNECTING SYSTEM</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    backgroundColor: colors.background,
  },
  emblem: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.violet,
    transform: [{ rotate: "45deg" }],
  },
  mark: {
    color: colors.violetSoft,
    fontSize: 25,
    fontWeight: "800",
    transform: [{ rotate: "-45deg" }],
  },
  label: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },
});
