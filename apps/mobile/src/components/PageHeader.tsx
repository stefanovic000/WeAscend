import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/theme";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  badge?: string;
};

export function PageHeader({ eyebrow, title, description, badge }: PageHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.topLine}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: colors.violetSoft,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.2,
  },
  badge: {
    color: colors.cyan,
    borderColor: "#245b68",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "700",
  },
  title: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
  },
  description: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
});
