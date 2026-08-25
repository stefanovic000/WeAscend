import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CloudStateMessage } from "@/components/CloudStateMessage";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { useCloudState } from "@/providers/CloudStateProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, radius, spacing } from "@/theme";

export default function CreateMenuScreen() {
  const router = useRouter();
  const { state, offline } = useCloudState();
  const { language } = usePreferences();
  const sr = language === "sr";

  if (!state) return <Screen><CloudStateMessage /></Screen>;

  const recentTemplates = [...(state.questTemplates ?? [])]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 3);

  return (
    <Screen>
      <PageHeader eyebrow={sr ? "BRZA AKCIJA" : "QUICK ACTION"} title={sr ? "Šta želiš da napraviš?" : "What do you want to create?"} />
      <Text style={styles.intro}>{sr ? "Izaberi najkraći put. Template je samo prečica do običnog, potpuno izmenjivog questa." : "Choose the shortest path. A template is only a shortcut to a normal, fully editable quest."}</Text>
      <View style={styles.actions}>
        <CreateChoice
          body={sr ? "Napravi novu konkretnu akciju od početka." : "Build a new concrete action from scratch."}
          disabled={offline}
          icon="add-circle-outline"
          onPress={() => router.replace("/quest/new")}
          title={sr ? "Novi quest" : "New quest"}
        />
        <CreateChoice
          body={sr ? "Uzmi sačuvanu osnovu, pa promeni detalje samo za danas." : "Start from a saved foundation, then change today's details."}
          disabled={offline}
          icon="copy-outline"
          onPress={() => router.replace("/templates?mode=use" as Href)}
          title={sr ? "Koristi template" : "Use template"}
        />
        <CreateChoice
          body={sr ? "Prava provera sposobnosti sa posebnim Clear rezultatom." : "A real test of ability with a separate Clear result."}
          disabled={offline}
          icon="trophy-outline"
          onPress={() => router.replace("/quest/new?type=Boss" as Href)}
          title={sr ? "Boss quest" : "Boss Quest"}
        />
      </View>

      {recentTemplates.length ? (
        <View style={styles.recentSection}>
          <View style={styles.sectionTop}>
            <Text style={styles.sectionTitle}>{sr ? "NEDAVNI TEMPLATE-I" : "RECENT TEMPLATES"}</Text>
            <Pressable onPress={() => router.replace("/templates?mode=use" as Href)}><Text style={styles.seeAll}>{sr ? "Svi" : "See all"}</Text></Pressable>
          </View>
          {recentTemplates.map(template => (
            <Pressable
              disabled={offline}
              key={template.id}
              onPress={() => router.replace({ pathname: "/quest/new", params: { templateId: template.id } } as Href)}
              style={({ pressed }) => [styles.templateRow, pressed && styles.pressed]}
            >
              <Ionicons color={colors.cyan} name="flash-outline" size={20} />
              <View style={styles.templateCopy}>
                <Text numberOfLines={1} style={styles.templateTitle}>{template.title}</Text>
                <Text style={styles.templateMeta}>{template.xp} XP · {scheduleLabel(template.schedule, template.intervalDays, sr)}</Text>
              </View>
              <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function CreateChoice({ body, disabled, icon, onPress, title }: { body: string; disabled: boolean; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; title: string }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.choice, disabled && styles.disabled, pressed && styles.pressed]}>
      <View style={styles.icon}><Ionicons color={colors.cyan} name={icon} size={25} /></View>
      <View style={styles.choiceCopy}><Text style={styles.choiceTitle}>{title}</Text><Text style={styles.choiceBody}>{body}</Text></View>
      <Ionicons color={colors.violetSoft} name="chevron-forward" size={20} />
    </Pressable>
  );
}

function scheduleLabel(schedule: "none" | "daily" | "weekly" | "interval", intervalDays: number | undefined, sr: boolean) {
  if (schedule === "daily") return sr ? "svaki dan" : "daily";
  if (schedule === "weekly") return sr ? "izabrani dani" : "selected days";
  if (schedule === "interval") return sr ? `svakih ${intervalDays ?? 2} dana` : `every ${intervalDays ?? 2} days`;
  return sr ? "ručno" : "manual";
}

const styles = StyleSheet.create({
  intro: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  actions: { marginTop: spacing.md, gap: spacing.sm },
  choice: { minHeight: 88, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  icon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 23, backgroundColor: "#10242d" },
  choiceCopy: { flex: 1, gap: 4 },
  choiceTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  choiceBody: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  recentSection: { marginTop: spacing.xl, gap: spacing.sm },
  sectionTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: colors.violetSoft, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  seeAll: { color: colors.cyan, fontSize: 12, fontWeight: "700" },
  templateRow: { minHeight: 62, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  templateCopy: { flex: 1, gap: 3 },
  templateTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  templateMeta: { color: colors.textMuted, fontSize: 10 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
});
