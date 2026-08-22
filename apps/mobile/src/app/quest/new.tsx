import { StyleSheet, Text, TextInput, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { colors, radius, spacing } from "@/theme";

function Selector({ label, value, disabled }: { label: string; value: string; disabled?: boolean }) {
  return (
    <View style={[styles.selector, disabled && styles.selectorDisabled]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={disabled ? styles.placeholderDisabled : styles.placeholder}>{value}</Text>
    </View>
  );
}

export default function NewQuestScreen() {
  return (
    <Screen>
      <Text style={styles.eyebrow}>NEW MISSION</Text>
      <Text style={styles.title}>Create a focused quest</Text>
      <Text style={styles.description}>First choose what this work improves. The path always stays visible.</Text>

      <View style={styles.path}>
        <Text style={styles.pathText}>Growth Area</Text>
        <Text style={styles.arrow}>›</Text>
        <Text style={styles.pathText}>Skill</Text>
        <Text style={styles.arrow}>›</Text>
        <Text style={styles.pathActive}>Quest</Text>
      </View>

      <View style={styles.form}>
        <Selector label="WHAT DOES THIS IMPROVE?" value="Choose a growth area" />
        <Selector label="WHICH SKILL?" value="Choose an area first" disabled />

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>QUEST NAME</Text>
          <TextInput
            placeholder="A concrete action you can complete"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>DESCRIPTION · OPTIONAL</Text>
          <TextInput
            multiline
            placeholder="What does done look like?"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.textarea]}
          />
        </View>

        <PrimaryButton disabled label="Continue" icon="arrow-forward" />
        <Text style={styles.foundationNote}>Mobile foundation only — account data and saving are connected in the next stage.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.violetSoft,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
  },
  title: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
  },
  description: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  path: {
    marginVertical: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  pathText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  pathActive: {
    color: colors.cyan,
    fontSize: 13,
    fontWeight: "700",
  },
  arrow: {
    color: colors.border,
    fontSize: 20,
  },
  form: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.violetSoft,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
  },
  textarea: {
    minHeight: 112,
    textAlignVertical: "top",
  },
  selector: {
    minHeight: 66,
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selectorDisabled: {
    opacity: 0.5,
  },
  placeholder: {
    color: colors.text,
    fontSize: 15,
  },
  placeholderDisabled: {
    color: colors.textMuted,
    fontSize: 15,
  },
  foundationNote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
