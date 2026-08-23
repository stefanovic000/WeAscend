import { Ionicons } from "@expo/vector-icons";
import { type WeAscendState } from "@weascend/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/theme";
import { formatHistoryDate, transactionTitle } from "@/utils/history";

type RecentProgressProps = {
  language: "en" | "sr";
  state: WeAscendState;
};

export function RecentProgress({ language, state }: RecentProgressProps) {
  const router = useRouter();
  const sr = language === "sr";
  const recent = [...state.transactions]
    .filter(transaction => !transaction.reversedAt)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 3);

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View>
          <Text style={styles.eyebrow}>{sr ? "HRONIKA" : "JOURNEY"}</Text>
          <Text style={styles.title}>{sr ? "Nedavni napredak" : "Recent progress"}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push("/history")} style={styles.historyButton}>
          <Text style={styles.historyLabel}>{sr ? "Istorija" : "View history"}</Text>
          <Ionicons color={colors.violetSoft} name="chevron-forward" size={16} />
        </Pressable>
      </View>

      {recent.length ? (
        <View style={styles.list}>
          {recent.map(transaction => (
            <View key={transaction.id} style={styles.row}>
              <View style={styles.icon}><Ionicons color={colors.cyan} name="sparkles" size={16} /></View>
              <View style={styles.copy}>
                <Text numberOfLines={1} style={styles.quest}>{transactionTitle(state, transaction, sr)}</Text>
                <Text style={styles.date}>{formatHistoryDate(transaction.createdAt, language)}</Text>
              </View>
              <Text style={styles.xp}>+{transaction.amount} XP</Text>
            </View>
          ))}
        </View>
      ) : (
        <Pressable onPress={() => router.push("/history")} style={styles.empty}>
          <Ionicons color={colors.textMuted} name="pulse-outline" size={22} />
          <Text style={styles.emptyText}>{sr ? "Ovde će se pojaviti prvi osvojeni XP." : "Your first earned XP will appear here."}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl },
  heading: { marginBottom: spacing.sm, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.sm },
  eyebrow: { marginBottom: 3, color: colors.violetSoft, fontSize: 8, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 20, fontWeight: "700" },
  historyButton: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 2, paddingLeft: spacing.sm },
  historyLabel: { color: colors.violetSoft, fontSize: 12, fontWeight: "700" },
  list: { overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  row: { minHeight: 64, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#12302f" },
  copy: { flex: 1, gap: 3 },
  quest: { color: colors.text, fontSize: 13, fontWeight: "700" },
  date: { color: colors.textMuted, fontSize: 10 },
  xp: { color: colors.cyan, fontSize: 12, fontWeight: "900" },
  empty: { minHeight: 82, padding: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.lg },
  emptyText: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
});
