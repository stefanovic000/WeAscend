import { Ionicons } from "@expo/vector-icons";
import { activeXp, localDateKey, progressFromXp, rankForLevel, type WeAscendState, type XpTransaction } from "@weascend/shared";
import { StyleSheet, Text, View } from "react-native";

import { CloudStateMessage } from "@/components/CloudStateMessage";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { useCloudState } from "@/providers/CloudStateProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, radius, spacing } from "@/theme";
import { formatHistoryDate, transactionPath, transactionTitle } from "@/utils/history";

function lastSevenDays() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return date;
  });
}

function xpGroups(state: WeAscendState, key: "attributeId" | "skillId") {
  const groups = new Map<string, number>();
  state.transactions.filter(transaction => !transaction.reversedAt).forEach(transaction => {
    groups.set(transaction[key], (groups.get(transaction[key]) ?? 0) + transaction.amount);
  });
  return [...groups.entries()].sort((left, right) => right[1] - left[1]);
}

export default function HistoryScreen() {
  const { state } = useCloudState();
  const { language } = usePreferences();
  const sr = language === "sr";

  if (!state) return <Screen><PageHeader eyebrow={sr ? "HRONIKA" : "JOURNEY"} title={sr ? "Istorija napretka" : "Progress history"} /><CloudStateMessage /></Screen>;

  const xp = activeXp(state.transactions);
  const level = progressFromXp(xp, state.settings).level;
  const rank = rankForLevel(level, state.settings.ranks);
  const days = lastSevenDays();
  const dayValues = days.map(day => activeXp(state.transactions.filter(transaction => localDateKey(transaction.createdAt) === localDateKey(day))));
  const weekXp = dayValues.reduce((sum, value) => sum + value, 0);
  const maxDay = Math.max(1, ...dayValues);
  const completed = state.quests.filter(quest => quest.status === "completed" || quest.archivedFromStatus === "completed").length;
  const failed = state.quests.filter(quest => quest.status === "failed" || quest.archivedFromStatus === "failed").length;
  const resolved = completed + failed;
  const clearRate = resolved ? Math.round((completed / resolved) * 100) : 0;
  const attributeGroups = xpGroups(state, "attributeId");
  const skillGroups = xpGroups(state, "skillId").slice(0, 6);
  const maxAttribute = Math.max(1, ...attributeGroups.map(([, value]) => value));
  const maxSkill = Math.max(1, ...skillGroups.map(([, value]) => value));
  const transactions = [...state.transactions].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 100);
  const events = [...state.levelEvents].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 8);

  return (
    <Screen>
      <PageHeader
        description={sr ? "Dokaz stvarnog rada, bez gubitka legitimno osvojenog napretka." : "A record of real work without erasing legitimately earned progress."}
        eyebrow={sr ? "HRONIKA" : "JOURNEY"}
        title={sr ? "Istorija napretka" : "Progress history"}
      />

      <View style={styles.metrics}>
        <Metric icon="flash-outline" label={sr ? "Ukupni XP" : "Total XP"} value={String(xp)} />
        <Metric icon="calendar-outline" label={sr ? "Poslednjih 7 dana" : "Last 7 days"} value={`${weekXp} XP`} />
        <Metric icon="shield-checkmark-outline" label={sr ? "Uspešnost" : "Clear rate"} value={`${clearRate}%`} />
        <Metric icon="trophy-outline" label={sr ? "Trenutni rank" : "Current rank"} value={`${rank} · L${level}`} />
      </View>

      <Section eyebrow={sr ? "RITAM" : "RHYTHM"} title={sr ? "Sedmodnevni XP" : "Seven-day XP"}>
        <View style={styles.chart}>
          {days.map((day, index) => {
            const value = dayValues[index];
            const barHeight = value ? Math.max(8, (value / maxDay) * 92) : 3;
            return (
              <View key={localDateKey(day)} style={styles.dayColumn}>
                <Text style={styles.dayXp}>{value || ""}</Text>
                <View style={styles.barTrack}><View style={[styles.bar, { height: barHeight }, index === 6 && styles.todayBar]} /></View>
                <Text style={[styles.dayLabel, index === 6 && styles.todayLabel]}>{day.toLocaleDateString(language === "sr" ? "sr-RS" : "en-US", { weekday: "narrow" })}</Text>
              </View>
            );
          })}
        </View>
      </Section>

      <View style={styles.outcomes}>
        <View style={styles.outcome}><Ionicons color={colors.cyan} name="checkmark-circle-outline" size={21} /><Text style={styles.outcomeValue}>{completed}</Text><Text style={styles.outcomeLabel}>{sr ? "završeno" : "completed"}</Text></View>
        <View style={styles.outcome}><Ionicons color={colors.danger} name="close-circle-outline" size={21} /><Text style={styles.outcomeValue}>{failed}</Text><Text style={styles.outcomeLabel}>{sr ? "neuspešno" : "failed"}</Text></View>
      </View>

      <Distribution
        empty={sr ? "Osvoji XP da vidiš raspodelu po oblastima." : "Earn XP to see its distribution across growth areas."}
        items={attributeGroups.map(([id, value]) => ({ id, value, color: state.attributes.find(attribute => attribute.id === id)?.color || colors.violet, name: state.attributes.find(attribute => attribute.id === id)?.name ?? (sr ? "Obrisana oblast" : "Deleted area") }))}
        max={maxAttribute}
        title={sr ? "XP po oblastima" : "XP by growth area"}
      />

      <Distribution
        empty={sr ? "Skill raspodela pojaviće se nakon prvog XP-a." : "Skill distribution appears after your first XP."}
        items={skillGroups.map(([id, value]) => ({ id, value, color: colors.cyan, name: state.skills.find(skill => skill.id === id)?.name ?? (sr ? "Obrisan skill" : "Deleted skill") }))}
        max={maxSkill}
        title={sr ? "Najjači skillovi" : "Strongest skills"}
      />

      {events.length ? (
        <Section eyebrow={sr ? "PREKRETNICE" : "MILESTONES"} title={sr ? "Level i rank događaji" : "Level and rank events"}>
          <View style={styles.eventList}>{events.map(event => (
            <View key={event.id} style={styles.eventRow}>
              <View style={styles.eventIcon}><Ionicons color={event.type === "rank" ? colors.gold : colors.violetSoft} name={event.type === "rank" ? "trophy-outline" : "arrow-up-circle-outline"} size={18} /></View>
              <View style={styles.eventCopy}><Text style={styles.eventTitle}>{event.type === "rank" ? (sr ? `Dostignut ${event.value} rank` : `Reached rank ${event.value}`) : (sr ? `Dostignut level ${event.value}` : `Reached level ${event.value}`)}</Text><Text style={styles.eventDate}>{formatHistoryDate(event.createdAt, language)}</Text></View>
            </View>
          ))}</View>
        </Section>
      ) : null}

      <Section eyebrow={sr ? "EVIDENCIJA" : "LEDGER"} title={sr ? "XP transakcije" : "XP transactions"}>
        {transactions.length ? <View style={styles.ledger}>{transactions.map(transaction => <TransactionRow key={transaction.id} language={language} state={state} transaction={transaction} />)}</View> : <Empty text={sr ? "Prva završena misija napraviće prvi XP zapis." : "Your first completed mission will create the first XP record."} />}
        {state.transactions.length > 100 ? <Text style={styles.limitNote}>{sr ? "Prikazano je poslednjih 100 transakcija." : "Showing the latest 100 transactions."}</Text> : null}
      </Section>
    </Screen>
  );
}

function Metric({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return <View style={styles.metric}><Ionicons color={colors.violetSoft} name={icon} size={19} /><Text style={styles.metricLabel}>{label}</Text><Text numberOfLines={1} style={styles.metricValue}>{value}</Text></View>;
}

function Section({ children, eyebrow, title }: { children: React.ReactNode; eyebrow: string; title: string }) {
  return <View style={styles.section}><Text style={styles.sectionEyebrow}>{eyebrow}</Text><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function Distribution({ empty, items, max, title }: { empty: string; items: { id: string; name: string; value: number; color: string }[]; max: number; title: string }) {
  return <Section eyebrow="ALLOCATION" title={title}>{items.length ? <View style={styles.distribution}>{items.map(item => <View key={item.id} style={styles.distributionRow}><View style={styles.distributionTop}><View style={styles.distributionName}><View style={[styles.dot, { backgroundColor: item.color }]} /><Text numberOfLines={1} style={styles.distributionLabel}>{item.name}</Text></View><Text style={styles.distributionXp}>{item.value} XP</Text></View><View style={styles.distributionTrack}><View style={[styles.distributionFill, { backgroundColor: item.color, width: `${(item.value / max) * 100}%` }]} /></View></View>)}</View> : <Empty text={empty} />}</Section>;
}

function TransactionRow({ language, state, transaction }: { language: "en" | "sr"; state: WeAscendState; transaction: XpTransaction }) {
  const sr = language === "sr";
  const reversed = Boolean(transaction.reversedAt);
  return <View style={[styles.transaction, reversed && styles.reversed]}><View style={[styles.transactionIcon, reversed && styles.reversedIcon]}><Ionicons color={reversed ? colors.danger : colors.cyan} name={reversed ? "arrow-undo-outline" : "sparkles"} size={16} /></View><View style={styles.transactionCopy}><Text numberOfLines={1} style={[styles.transactionTitle, reversed && styles.reversedText]}>{transactionTitle(state, transaction, sr)}</Text><Text numberOfLines={1} style={styles.transactionPath}>{transactionPath(state, transaction, sr)}</Text><Text style={styles.transactionDate}>{formatHistoryDate(transaction.createdAt, language)}</Text></View><Text style={[styles.transactionXp, reversed && styles.reversedXp]}>{reversed ? (sr ? "PONIŠTENO" : "REVERSED") : `+${transaction.amount} XP`}</Text></View>;
}

function Empty({ text }: { text: string }) {
  return <View style={styles.empty}><Ionicons color={colors.textMuted} name="pulse-outline" size={23} /><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metric: { width: "48%", minHeight: 104, flexGrow: 1, padding: spacing.md, gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  metricLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  metricValue: { color: colors.text, fontSize: 20, fontWeight: "800" },
  section: { marginTop: spacing.xl },
  sectionEyebrow: { marginBottom: 3, color: colors.violetSoft, fontSize: 8, fontWeight: "900", letterSpacing: 1.4 },
  sectionTitle: { marginBottom: spacing.sm, color: colors.text, fontSize: 20, fontWeight: "700" },
  chart: { height: 150, paddingHorizontal: spacing.sm, paddingTop: spacing.sm, flexDirection: "row", alignItems: "flex-end", gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  dayColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 5 },
  dayXp: { height: 14, color: colors.textMuted, fontSize: 8, fontWeight: "700" },
  barTrack: { width: "72%", height: 92, justifyContent: "flex-end", overflow: "hidden", borderRadius: 6, backgroundColor: "#17192d" },
  bar: { width: "100%", borderRadius: 6, backgroundColor: "#6654b6" },
  todayBar: { backgroundColor: colors.cyan },
  dayLabel: { height: 24, color: colors.textMuted, fontSize: 10, fontWeight: "800" },
  todayLabel: { color: colors.cyan },
  outcomes: { marginTop: spacing.md, flexDirection: "row", gap: spacing.sm },
  outcome: { minHeight: 62, flex: 1, padding: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  outcomeValue: { color: colors.text, fontSize: 18, fontWeight: "800" },
  outcomeLabel: { color: colors.textMuted, fontSize: 10 },
  distribution: { padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  distributionRow: { gap: spacing.xs },
  distributionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  distributionName: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  distributionLabel: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "700" },
  distributionXp: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
  distributionTrack: { height: 5, overflow: "hidden", borderRadius: 3, backgroundColor: colors.border },
  distributionFill: { height: "100%", borderRadius: 3 },
  eventList: { overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  eventRow: { minHeight: 62, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  eventIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: colors.surfaceRaised },
  eventCopy: { flex: 1, gap: 3 },
  eventTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  eventDate: { color: colors.textMuted, fontSize: 10 },
  ledger: { overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  transaction: { minHeight: 78, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  reversed: { opacity: 0.66, backgroundColor: "#17101c" },
  transactionIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#12302f" },
  reversedIcon: { backgroundColor: "#341620" },
  transactionCopy: { flex: 1, gap: 2 },
  transactionTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  reversedText: { color: colors.textMuted, textDecorationLine: "line-through" },
  transactionPath: { color: colors.textMuted, fontSize: 10 },
  transactionDate: { color: colors.textMuted, fontSize: 9 },
  transactionXp: { color: colors.cyan, fontSize: 11, fontWeight: "900" },
  reversedXp: { color: colors.danger, fontSize: 8 },
  empty: { minHeight: 84, padding: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.lg },
  emptyText: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  limitNote: { marginTop: spacing.xs, color: colors.textMuted, fontSize: 9, textAlign: "center" },
});
