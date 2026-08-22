import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { PageHeader } from "@/components/PageHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { colors, radius, spacing } from "@/theme";

const hierarchy = [
  { icon: "planet-outline" as const, label: "Growth Area", example: "Languages" },
  { icon: "school-outline" as const, label: "Skill", example: "Spanish" },
  { icon: "checkbox-outline" as const, label: "Quest", example: "Practice 20 phrases" },
];

export default function ProgressScreen() {
  return (
    <Screen>
      <PageHeader
        eyebrow="YOUR PATH"
        title="Progress"
        description="Organize what you want to improve, then attach real work to it."
      />

      <View style={styles.tree}>
        {hierarchy.map((item, index) => (
          <View key={item.label}>
            <View style={[styles.node, { marginLeft: index * 20 }]}>
              <View style={styles.iconWrap}>
                <Ionicons color={colors.violetSoft} name={item.icon} size={21} />
              </View>
              <View style={styles.nodeCopy}>
                <Text style={styles.nodeLabel}>{item.label}</Text>
                <Text style={styles.nodeExample}>{item.example}</Text>
              </View>
            </View>
            {index < hierarchy.length - 1 ? <View style={[styles.connector, { marginLeft: 24 + index * 20 }]} /> : null}
          </View>
        ))}
      </View>

      <Text style={styles.helper}>Start with one broad area. Skills belong to an area, and every quest belongs to one skill.</Text>
      <PrimaryButton label="Add growth area" icon="add-circle-outline" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tree: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  node: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#201b42",
  },
  nodeCopy: {
    gap: 2,
  },
  nodeLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  nodeExample: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
  },
  connector: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  helper: {
    marginVertical: spacing.md,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
});
