"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { activeXp, canAwardQuest, isValidBackup, makeInitialState, nextRecurringInstance, progressFromXp, rankForLevel, type AppState, type Boss, type Quest, type QuestStatus, type QuestType } from "./domain";
import { clearState, loadState, saveState } from "./db";

type View = "dashboard" | "quests" | "growth" | "bosses" | "history" | "settings";
const views: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Command", icon: "◇" },
  { id: "quests", label: "Quests", icon: "✦" },
  { id: "growth", label: "Growth", icon: "⌁" },
  { id: "bosses", label: "Bosses", icon: "⬡" },
  { id: "history", label: "History", icon: "◫" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

const blankQuest = (state: AppState): Quest => {
  const now = new Date();
  const deadline = new Date(now.getTime() + 3600000);
  const attribute = state.attributes[0];
  const skill = state.skills.find(s => s.attributeId === attribute?.id);
  return {
    id: crypto.randomUUID(), title: "", description: "", type: "Side",
    attributeId: attribute?.id ?? "", skillId: skill?.id ?? "", xp: 10,
    date: now.toISOString(), deadline: deadline.toISOString(), recurrence: "none",
    difficulty: "Normal", completionConditions: "", failureConsequence: "",
    status: "active", createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
};

const isoLocal = (value: string) => value ? new Date(value).toISOString().slice(0, 16) : "";
const fromLocal = (value: string) => value ? new Date(value).toISOString() : "";
const dayKey = (value: string | Date) => new Date(value).toLocaleDateString("sv-SE");
const formatDate = (value: string, time = true) => value ? new Intl.DateTimeFormat("sr-Latn", { day: "2-digit", month: "short", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(value)) : "Bez roka";
const today = dayKey(new Date());

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`field ${wide ? "wide" : ""}`}><span>{label}</span>{children}</label>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><span>◇</span><strong>{title}</strong><p>{text}</p></div>;
}

export default function SoloApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [questDraft, setQuestDraft] = useState<Quest | null>(null);
  const [toast, setToast] = useState("");
  const [ceremony, setCeremony] = useState<{ eyebrow: string; title: string; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; text: string; action: () => void } | null>(null);
  const [filters, setFilters] = useState({ search: "", type: "all", status: "all", attribute: "all" });
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadState().then(saved => setState(saved && isValidBackup(saved) ? saved : makeInitialState())).catch(() => setState(makeInitialState()));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  useEffect(() => {
    if (state) saveState(state).catch(() => setToast("Čuvanje nije uspelo. Napravi JSON backup."));
  }, [state]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const metrics = useMemo(() => {
    if (!state) return null;
    const xp = activeXp(state.transactions);
    const progress = progressFromXp(xp, state.settings);
    return { xp, progress, rank: rankForLevel(progress.level, state.settings.ranks) };
  }, [state]);

  if (!state || !metrics) return <main className="loading"><div className="loader-mark">A</div><p>Inicijalizujem sistem…</p></main>;

  const updateState = (recipe: (current: AppState) => AppState) => setState(current => current ? recipe(current) : current);
  const attrName = (id: string) => state.attributes.find(a => a.id === id)?.name ?? "Unassigned";
  const skillName = (id: string) => state.skills.find(s => s.id === id)?.name ?? "General";
  const attrColor = (id: string) => state.attributes.find(a => a.id === id)?.color ?? "#866bff";
  const activeQuests = state.quests.filter(q => q.status === "active");
  const todayQuests = activeQuests.filter(q => dayKey(q.date) === today);
  const mainQuest = todayQuests.find(q => q.type === "Main") ?? activeQuests.find(q => q.type === "Main");

  const completeQuest = (quest: Quest) => {
    if (!canAwardQuest(quest.id, state.transactions)) {
      setToast("Ovaj quest je već bodovan.");
      return;
    }
    const before = metrics.progress;
    const oldRank = metrics.rank;
    const stamp = new Date().toISOString();
    const transaction = quest.xp > 0 ? {
      id: crypto.randomUUID(), questId: quest.id, amount: quest.xp, kind: "quest" as const,
      attributeId: quest.attributeId, skillId: quest.skillId, createdAt: stamp,
    } : null;
    const next = nextRecurringInstance(quest);
    const nextTransactions = transaction ? [...state.transactions, transaction] : state.transactions;
    const after = progressFromXp(activeXp(nextTransactions), state.settings);
    const newRank = rankForLevel(after.level, state.settings.ranks);
    updateState(s => ({
      ...s,
      quests: [...s.quests.map(q => q.id === quest.id ? { ...q, status: "completed" as const, completedAt: stamp, updatedAt: stamp } : q), ...(next ? [next] : [])],
      transactions: nextTransactions,
      levelEvents: [
        ...s.levelEvents,
        ...(after.level > before.level ? [{ id: crypto.randomUUID(), type: "level" as const, value: String(after.level), createdAt: stamp }] : []),
        ...(newRank !== oldRank ? [{ id: crypto.randomUUID(), type: "rank" as const, value: newRank, createdAt: stamp }] : []),
      ],
    }));
    if (newRank !== oldRank) setCeremony({ eyebrow: "RANK ASCENSION", title: `${newRank}-RANK`, text: "Novi prag je dostignut. Sistem je zabeležio tvoj napredak." });
    else if (after.level > before.level) setCeremony({ eyebrow: "LEVEL UP", title: `LEVEL ${after.level}`, text: `Novi kapacitet otključan. Sledeći nivo traži ${after.needed} XP.` });
    else setToast(quest.xp ? `+${quest.xp} XP zabeleženo` : "Quest završen · 0 XP");
  };

  const failQuest = (quest: Quest) => {
    updateState(s => ({ ...s, quests: s.quests.map(q => q.id === quest.id ? { ...q, status: "failed", updatedAt: new Date().toISOString() } : q) }));
    if (quest.type === "Mandatory" && quest.failureConsequence) {
      setCeremony({ eyebrow: "MANDATORY QUEST FAILED", title: "CONSEQUENCE ACTIVE", text: quest.failureConsequence });
    } else setToast("Quest označen kao neuspešan · 0 XP");
  };

  const undoQuest = (quest: Quest) => {
    const stamp = new Date().toISOString();
    updateState(s => ({
      ...s,
      quests: s.quests.map(q => q.id === quest.id ? { ...q, status: "active", completedAt: undefined, updatedAt: stamp } : q),
      transactions: s.transactions.map(tx => tx.questId === quest.id && !tx.reversedAt ? { ...tx, reversedAt: stamp } : tx),
    }));
    setToast("Completion poništen; samo XP ovog questa je vraćen.");
  };

  const saveQuest = () => {
    if (!questDraft?.title.trim()) { setToast("Unesi naziv questa."); return; }
    if (!questDraft.attributeId || !questDraft.skillId) { setToast("Izaberi attribute i skill."); return; }
    const exists = state.quests.some(q => q.id === questDraft.id);
    const updated = { ...questDraft, updatedAt: new Date().toISOString(), xp: Math.max(0, Number(questDraft.xp) || 0) };
    updateState(s => ({ ...s, quests: exists ? s.quests.map(q => q.id === updated.id ? updated : q) : [updated, ...s.quests] }));
    setQuestDraft(null);
    setToast(exists ? "Quest izmenjen." : "Novi quest je aktivan.");
  };

  const deleteQuest = (quest: Quest) => setConfirmAction({
    title: "Obrisati quest?",
    text: "Quest će biti trajno uklonjen. Postojeće XP transakcije ostaju u istoriji radi integriteta.",
    action: () => { updateState(s => ({ ...s, quests: s.quests.filter(q => q.id !== quest.id) })); setConfirmAction(null); setToast("Quest obrisan."); },
  });

  const addAttribute = () => {
    const name = window.prompt("Naziv novog atributa:");
    if (!name?.trim()) return;
    const stamp = new Date().toISOString();
    updateState(s => ({ ...s, attributes: [...s.attributes, { id: crypto.randomUUID(), name: name.trim(), color: ["#866bff", "#32d6c5", "#4ea5ff", "#ff6da8"][s.attributes.length % 4], createdAt: stamp, updatedAt: stamp }] }));
  };
  const addSkill = (attributeId: string) => {
    const name = window.prompt("Naziv novog skilla:");
    if (!name?.trim()) return;
    const stamp = new Date().toISOString();
    updateState(s => ({ ...s, skills: [...s.skills, { id: crypto.randomUUID(), attributeId, name: name.trim(), createdAt: stamp, updatedAt: stamp }] }));
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ascend-backup-${today}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setToast("Backup je preuzet.");
  };
  const importJson = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isValidBackup(parsed)) throw new Error("invalid");
      setConfirmAction({
        title: "Zameniti sve podatke?",
        text: "Validan backup je spreman. Trenutni lokalni podaci biće zamenjeni.",
        action: () => { setState(parsed); setConfirmAction(null); setToast("Backup je uspešno vraćen."); },
      });
    } catch { setToast("JSON nije validan ASCEND backup."); }
  };

  const filteredQuests = state.quests.filter(q =>
    (filters.type === "all" || q.type === filters.type) &&
    (filters.status === "all" || q.status === filters.status) &&
    (filters.attribute === "all" || q.attributeId === filters.attribute) &&
    (!filters.search || `${q.title} ${q.description}`.toLowerCase().includes(filters.search.toLowerCase()))
  );

  const renderQuestCard = (quest: Quest, compact = false) => (
    <article className={`quest-card ${quest.status} ${compact ? "compact" : ""}`} key={quest.id}>
      <div className="quest-accent" style={{ background: attrColor(quest.attributeId) }} />
      <div className="quest-card-main">
        <div className="quest-meta">
          <span className={`type-badge type-${quest.type.toLowerCase()}`}>{quest.type}</span>
          <span>{attrName(quest.attributeId)} / {skillName(quest.skillId)}</span>
        </div>
        <h3>{quest.title}</h3>
        {!compact && quest.description && <p>{quest.description}</p>}
        <div className="quest-footer">
          <span>◷ {formatDate(quest.deadline)}</span>
          <span className="xp-reward">+{quest.xp} XP</span>
          <span className="difficulty">{quest.difficulty}</span>
        </div>
      </div>
      <div className="quest-actions">
        {quest.status === "active" && <>
          <button className="complete" onClick={() => completeQuest(quest)} aria-label={`Završi ${quest.title}`}>✓</button>
          <button onClick={() => failQuest(quest)} aria-label={`Označi ${quest.title} neuspešnim`}>×</button>
        </>}
        {quest.status === "completed" && <button onClick={() => undoQuest(quest)}>Undo</button>}
        {!compact && <>
          <button onClick={() => setQuestDraft({ ...quest })}>Edit</button>
          <button onClick={() => updateState(s => ({ ...s, quests: s.quests.map(q => q.id === quest.id ? { ...q, status: "archived" } : q) }))}>Archive</button>
          <button className="danger-link" onClick={() => deleteQuest(quest)}>Delete</button>
        </>}
      </div>
    </article>
  );

  const Dashboard = () => {
    const recent = [...state.transactions].filter(tx => !tx.reversedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
    return <div className="screen dashboard-screen">
      <section className="hero">
        <div className="hero-copy">
          <p className="system-label"><span /> SYSTEM ONLINE · LOCAL MODE</p>
          <p className="kicker">CURRENT DIRECTIVE</p>
          <h1>Koja je moja<br /><em>sledeća misija?</em></h1>
          <p>Napredak se ne nagađa. Evidentira se.</p>
          <button className="primary" onClick={() => setQuestDraft(blankQuest(state))}>＋ Add Quest</button>
        </div>
        <div className="rank-orbit" aria-label={`${metrics.rank} rank, level ${metrics.progress.level}`}>
          <div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" />
          <div className="rank-core"><span>RANK</span><strong>{metrics.rank}</strong><small>LEVEL {String(metrics.progress.level).padStart(2, "0")}</small></div>
        </div>
      </section>
      <section className="xp-panel">
        <div><span>GLOBAL EXPERIENCE</span><strong>{metrics.xp.toLocaleString()} XP</strong></div>
        <div className="xp-track"><i style={{ width: `${metrics.progress.percent}%` }} /></div>
        <p>{metrics.progress.current} / {metrics.progress.needed} XP <span>{metrics.progress.needed - metrics.progress.current} XP do Level {metrics.progress.level + 1}</span></p>
      </section>
      <div className="dashboard-grid">
        <section className="panel main-mission">
          <div className="section-title"><div><span>01</span><p>PRIORITY OBJECTIVE</p><h2>Main Quest</h2></div><button onClick={() => setView("quests")}>View all →</button></div>
          {mainQuest ? renderQuestCard(mainQuest, true) : <Empty title="Nema Main Questa" text="Postavi jednu jasnu misiju koja pomera dan napred." />}
        </section>
        <aside className="panel pulse">
          <div className="section-title"><div><span>02</span><p>LIVE METRICS</p><h2>Today&apos;s Pulse</h2></div></div>
          <div className="pulse-ring" style={{ "--progress": `${todayQuests.length ? Math.round(todayQuests.filter(q => q.status === "completed").length / todayQuests.length * 100) : 0}%` } as React.CSSProperties}>
            <strong>{todayQuests.filter(q => q.status === "completed").length}<small>/{todayQuests.length}</small></strong><span>QUESTS</span>
          </div>
          <div className="mini-stats"><div><span>Completed</span><strong>{state.quests.filter(q => q.status === "completed").length}</strong></div><div><span>Failed</span><strong>{state.quests.filter(q => q.status === "failed").length}</strong></div></div>
        </aside>
      </div>
      <section className="panel today-list">
        <div className="section-title"><div><span>03</span><p>ACTIVE LOG</p><h2>Today&apos;s Quests</h2></div><button onClick={() => setQuestDraft(blankQuest(state))}>＋ New</button></div>
        <div className="quest-list">{todayQuests.length ? todayQuests.map(q => renderQuestCard(q, true)) : <Empty title="Dnevni log je čist" text="Dodaj sledeću konkretnu akciju." />}</div>
      </section>
      <section className="achievements">
        <div className="section-title"><div><span>04</span><p>SYSTEM FEED</p><h2>Recent Achievements</h2></div></div>
        <div className="achievement-grid">
          {recent.length ? recent.map(tx => <div className="achievement" key={tx.id}><i>✦</i><div><strong>Quest cleared</strong><span>{state.quests.find(q => q.id === tx.questId)?.title ?? "Boss encounter"}</span></div><b>+{tx.amount}</b></div>) : <Empty title="Istorija čeka prvi clear" text="Završi quest da pokreneš svoj feed." />}
        </div>
      </section>
    </div>;
  };

  const Quests = () => <div className="screen">
    <header className="screen-header"><div><p>MISSION CONTROL</p><h1>Quest Manager</h1><span>{activeQuests.length} active · {state.quests.filter(q => q.status === "completed").length} cleared</span></div><button className="primary" onClick={() => setQuestDraft(blankQuest(state))}>＋ Create Quest</button></header>
    <section className="filters">
      <input aria-label="Pretraži questove" placeholder="Pretraži misije…" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
      <select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}><option value="all">All types</option>{state.settings.questTypes.map(t => <option key={t}>{t}</option>)}</select>
      <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="all">All statuses</option>{["active", "completed", "failed", "skipped", "archived"].map(s => <option key={s}>{s}</option>)}</select>
      <select value={filters.attribute} onChange={e => setFilters({ ...filters, attribute: e.target.value })}><option value="all">All attributes</option>{state.attributes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
    </section>
    <div className="quest-list full">{filteredQuests.length ? filteredQuests.map(q => renderQuestCard(q)) : <Empty title="Nema rezultata" text="Promeni filtere ili kreiraj novi quest." />}</div>
  </div>;

  const Growth = () => <div className="screen">
    <header className="screen-header"><div><p>CHARACTER MATRIX</p><h1>Attributes & Skills</h1><span>XP se računa iz jedinstvene globalne transakcije — bez dupliranja.</span></div><button className="primary" onClick={addAttribute}>＋ Attribute</button></header>
    <div className="attribute-grid">{state.attributes.map(attr => {
      const skills = state.skills.filter(s => s.attributeId === attr.id);
      const txs = state.transactions.filter(tx => tx.attributeId === attr.id && !tx.reversedAt);
      const xp = activeXp(txs);
      const max = Math.max(...state.attributes.map(a => activeXp(state.transactions.filter(tx => tx.attributeId === a.id && !tx.reversedAt))), 1);
      return <section className="attribute-card" key={attr.id} style={{ "--attr": attr.color } as React.CSSProperties}>
        <header><i>{attr.name.charAt(0)}</i><div><span>ATTRIBUTE</span><h2>{attr.name}</h2></div><strong>{xp}<small> XP</small></strong></header>
        <div className="attr-track"><i style={{ width: `${xp / max * 100}%` }} /></div>
        <div className="skill-list">{skills.map(skill => {
          const skillTx = state.transactions.filter(tx => tx.skillId === skill.id && !tx.reversedAt);
          return <div className="skill-row" key={skill.id}><div><strong>{skill.name}</strong><span>{state.quests.filter(q => q.skillId === skill.id && q.status === "completed").length} quests cleared</span></div><b>{activeXp(skillTx)} XP</b></div>;
        })}</div>
        <button className="ghost" onClick={() => addSkill(attr.id)}>＋ Add skill</button>
      </section>;
    })}</div>
  </div>;

  const resolveBoss = (boss: Boss, cleared: boolean) => {
    const result = window.prompt(cleared ? `Unesi rezultat za "${boss.title}":` : "Kratka analiza neuspeha:", "") ?? "";
    const stamp = new Date().toISOString();
    const award = cleared ? boss.xp : boss.attemptXp;
    updateState(s => ({
      ...s,
      bosses: s.bosses.map(b => b.id === boss.id ? { ...b, status: cleared ? "cleared" : "failed", result, updatedAt: stamp } : b),
      transactions: award > 0 && !s.transactions.some(tx => tx.questId === `boss:${boss.id}` && !tx.reversedAt)
        ? [...s.transactions, { id: crypto.randomUUID(), questId: `boss:${boss.id}`, amount: award, kind: cleared ? "quest" : "boss_attempt", attributeId: "", skillId: "", createdAt: stamp }]
        : s.transactions,
    }));
    if (cleared) setCeremony({ eyebrow: "DUNGEON CONQUERED", title: "BOSS CLEAR", text: `${boss.title} · +${boss.xp} XP` });
    else setCeremony({ eyebrow: "ENCOUNTER FAILED", title: "ANALYZE. ADAPT.", text: award ? `Attempt XP: +${award}. Zapiši correction quest.` : "0 XP. Pretvori analizu u sledeći Correction Quest." });
  };
  const addBoss = () => {
    const title = window.prompt("Naziv novog Bossa:");
    if (!title?.trim()) return;
    const stamp = new Date().toISOString();
    updateState(s => ({ ...s, bosses: [...s.bosses, { id: crypto.randomUUID(), title: title.trim(), dungeon: "New Dungeon", stage: "Final Stage", entryConditions: "", preparationQuestIds: [], date: new Date(Date.now() + 7 * 86400000).toISOString(), clearCondition: "Definiši merljiv rezultat", xp: 100, attemptXp: 0, status: "active", result: "", createdAt: stamp, updatedAt: stamp }] }));
  };
  const Bosses = () => <div className="screen">
    <header className="screen-header"><div><p>DUNGEON GATE</p><h1>Bosses & Dungeons</h1><span>Stvarna provera sposobnosti. Nagrada samo za definisan rezultat.</span></div><button className="primary" onClick={addBoss}>＋ New Boss</button></header>
    <div className="boss-grid">{state.bosses.map(boss => {
      const prepared = boss.preparationQuestIds.filter(id => state.quests.find(q => q.id === id)?.status === "completed").length;
      return <article className={`boss-card ${boss.status}`} key={boss.id}>
        <div className="boss-visual"><span>{boss.status === "cleared" ? "CLEARED" : boss.status === "failed" ? "FAILED" : "GATE OPEN"}</span><strong>⬡</strong><p>{formatDate(boss.date, false)}</p></div>
        <div className="boss-content"><div className="quest-meta"><span className="type-badge type-boss">BOSS</span><span>{boss.dungeon} / {boss.stage}</span></div><h2>{boss.title}</h2>
          <dl><div><dt>ENTRY</dt><dd>{boss.entryConditions || "No gate condition"}</dd></div><div><dt>CLEAR CONDITION</dt><dd>{boss.clearCondition}</dd></div><div><dt>PREPARATION</dt><dd>{prepared}/{boss.preparationQuestIds.length} questova</dd></div></dl>
          <footer><strong>+{boss.xp} XP</strong>{boss.status === "active" && <div><button className="complete-text" onClick={() => resolveBoss(boss, true)}>Boss Clear</button><button onClick={() => resolveBoss(boss, false)}>Failed</button></div>}{boss.status !== "active" && <p>{boss.result || "Rezultat evidentiran."}</p>}</footer>
        </div>
      </article>;
    })}</div>
  </div>;

  const History = () => {
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); return d; });
    const dayValues = days.map(d => activeXp(state.transactions.filter(tx => dayKey(tx.createdAt) === dayKey(d))));
    const maxDay = Math.max(...dayValues, 1);
    const byAttribute = state.attributes.map(attr => ({ ...attr, xp: activeXp(state.transactions.filter(tx => tx.attributeId === attr.id)) }));
    return <div className="screen">
      <header className="screen-header"><div><p>CHRONICLE</p><h1>History & Statistics</h1><span>Svaki XP ima izvor, vreme i stanje transakcije.</span></div></header>
      <div className="stats-top"><div><span>Total XP</span><strong>{metrics.xp}</strong></div><div><span>This week</span><strong>{activeXp(state.transactions.filter(tx => Date.now() - new Date(tx.createdAt).getTime() < 7 * 86400000))}</strong></div><div><span>Clear rate</span><strong>{state.quests.length ? Math.round(state.quests.filter(q => q.status === "completed").length / state.quests.length * 100) : 0}%</strong></div><div><span>Current rank</span><strong>{metrics.rank}</strong></div></div>
      <div className="history-grid">
        <section className="panel chart-panel"><div className="section-title"><div><p>LAST 14 DAYS</p><h2>XP Activity</h2></div></div><div className="bar-chart">{dayValues.map((value, i) => <div key={dayKey(days[i])}><i style={{ height: `${Math.max(4, value / maxDay * 100)}%` }} title={`${value} XP`} /><span>{i % 2 ? "" : days[i].getDate()}</span></div>)}</div></section>
        <section className="panel distribution"><div className="section-title"><div><p>ALLOCATION</p><h2>By Attribute</h2></div></div>{byAttribute.map(attr => <div className="dist-row" key={attr.id}><div><span><i style={{ background: attr.color }} />{attr.name}</span><strong>{attr.xp} XP</strong></div><div><i style={{ width: `${metrics.xp ? attr.xp / metrics.xp * 100 : 0}%`, background: attr.color }} /></div></div>)}</section>
      </div>
      <section className="panel ledger"><div className="section-title"><div><p>AUDIT TRAIL</p><h2>XP Transaction History</h2></div></div>
        <div className="ledger-list">{[...state.transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(tx => <div className={tx.reversedAt ? "reversed" : ""} key={tx.id}><span>{formatDate(tx.createdAt)}</span><strong>{state.quests.find(q => q.id === tx.questId)?.title ?? state.bosses.find(b => `boss:${b.id}` === tx.questId)?.title ?? "System event"}</strong><em>{attrName(tx.attributeId)} / {skillName(tx.skillId)}</em><b>{tx.reversedAt ? "REVERSED" : `+${tx.amount} XP`}</b></div>)}</div>
      </section>
    </div>;
  };

  const SettingsView = () => <div className="screen settings-screen">
    <header className="screen-header"><div><p>SYSTEM CONFIGURATION</p><h1>Settings</h1><span>Ti definišeš pravila. Sistem ih samo dosledno primenjuje.</span></div></header>
    <div className="settings-grid">
      <section className="settings-card"><header><i>ƒ</i><div><h2>XP Formula</h2><p>XP za sledeći level = base + growth × (level − 1)</p></div></header><div className="settings-row"><Field label="Base XP"><input type="number" min="1" value={state.settings.baseXp} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, baseXp: Math.max(1, Number(e.target.value)) } }))} /></Field><Field label="Growth / level"><input type="number" min="0" value={state.settings.levelGrowth} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, levelGrowth: Math.max(0, Number(e.target.value)) } }))} /></Field></div></section>
      <section className="settings-card"><header><i>R</i><div><h2>Rank Thresholds</h2><p>Podesi minimalni level za svaki rank.</p></div></header><div className="rank-settings">{state.settings.ranks.map((rank, index) => <Field label={`${rank.name}-Rank`} key={rank.name}><input type="number" min="1" value={rank.minLevel} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, ranks: s.settings.ranks.map((r, i) => i === index ? { ...r, minLevel: Math.max(1, Number(e.target.value)) } : r) } }))} /></Field>)}</div></section>
      <section className="settings-card"><header><i>◈</i><div><h2>Experience Rules</h2><p>Kontrole ponašanja i prikaza.</p></div></header><label className="toggle-row"><div><strong>Limit daily repeat</strong><span>Spreči više bodovanja iste dnevne instance.</span></div><input type="checkbox" checked={state.settings.dailyRepeatLimit} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, dailyRepeatLimit: e.target.checked } }))} /></label><label className="toggle-row"><div><strong>Animations</strong><span>Level-up i progress animacije.</span></div><input type="checkbox" checked={state.settings.animations} onChange={e => updateState(s => ({ ...s, settings: { ...s.settings, animations: e.target.checked } }))} /></label></section>
      <section className="settings-card"><header><i>⇅</i><div><h2>Backup & Restore</h2><p>Portable JSON kopija svih lokalnih podataka.</p></div></header><div className="button-row"><button className="primary" onClick={exportJson}>Export JSON</button><button onClick={() => importRef.current?.click()}>Import JSON</button><input ref={importRef} hidden type="file" accept="application/json" onChange={e => e.target.files?.[0] && importJson(e.target.files[0])} /></div></section>
      <section className="settings-card danger-zone"><header><i>!</i><div><h2>Reset System</h2><p>Trajno briše sve lokalne podatke i vraća početni primer.</p></div></header><button onClick={() => setConfirmAction({ title: "Potpuni reset?", text: "Svi questovi, XP transakcije, bossovi i podešavanja biće obrisani. Pre toga preporučujemo export.", action: async () => { await clearState(); setState(makeInitialState()); setConfirmAction(null); setToast("Sistem je resetovan."); } })}>Reset all data</button></section>
    </div>
  </div>;

  return <div className={`app-shell ${state.settings.animations ? "" : "reduce-motion"}`}>
    <aside className="sidebar">
      <button className="brand" onClick={() => setView("dashboard")}><span>A</span><div><strong>ASCEND</strong><small>SOLO PROGRESS SYSTEM</small></div></button>
      <nav>{views.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i>{item.icon}</i><span>{item.label}</span>{item.id === "quests" && activeQuests.length > 0 && <b>{activeQuests.length}</b>}</button>)}</nav>
      <div className="sidebar-profile"><div>{metrics.rank}</div><span><strong>Hunter</strong><small>Level {metrics.progress.level} · {metrics.xp} XP</small></span></div>
      <p className="local-status"><i /> LOCAL · AUTO-SAVED</p>
    </aside>
    <main className="content">
      <div className="mobile-top"><button className="brand" onClick={() => setView("dashboard")}><span>A</span><strong>ASCEND</strong></button><button onClick={() => setQuestDraft(blankQuest(state))}>＋</button></div>
      {view === "dashboard" && <Dashboard />}
      {view === "quests" && <Quests />}
      {view === "growth" && <Growth />}
      {view === "bosses" && <Bosses />}
      {view === "history" && <History />}
      {view === "settings" && <SettingsView />}
    </main>
    <nav className="bottom-nav">{views.slice(0, 5).map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i>{item.icon}</i><span>{item.label}</span></button>)}</nav>

    {questDraft && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setQuestDraft(null)}>
      <section className="modal quest-modal" role="dialog" aria-modal="true" aria-label="Quest editor">
        <header><div><p>MISSION EDITOR</p><h2>{state.quests.some(q => q.id === questDraft.id) ? "Edit Quest" : "Create New Quest"}</h2></div><button onClick={() => setQuestDraft(null)}>×</button></header>
        <div className="form-grid">
          <Field label="Quest name" wide><input autoFocus value={questDraft.title} onChange={e => setQuestDraft({ ...questDraft, title: e.target.value })} placeholder="Npr. 50 min dubokog rada" /></Field>
          <Field label="Description" wide><textarea value={questDraft.description} onChange={e => setQuestDraft({ ...questDraft, description: e.target.value })} placeholder="Kratak kontekst misije…" /></Field>
          <Field label="Type"><select value={questDraft.type} onChange={e => setQuestDraft({ ...questDraft, type: e.target.value as QuestType })}>{state.settings.questTypes.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Difficulty"><select value={questDraft.difficulty} onChange={e => setQuestDraft({ ...questDraft, difficulty: e.target.value as Quest["difficulty"] })}>{["Easy", "Normal", "Hard", "Extreme"].map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Attribute"><select value={questDraft.attributeId} onChange={e => { const id = e.target.value; setQuestDraft({ ...questDraft, attributeId: id, skillId: state.skills.find(s => s.attributeId === id)?.id ?? "" }); }}>{state.attributes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Skill"><select value={questDraft.skillId} onChange={e => setQuestDraft({ ...questDraft, skillId: e.target.value })}>{state.skills.filter(s => s.attributeId === questDraft.attributeId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="XP reward"><input type="number" min="0" value={questDraft.xp} onChange={e => setQuestDraft({ ...questDraft, xp: Number(e.target.value) })} /></Field>
          <Field label="Recurrence"><select value={questDraft.recurrence} onChange={e => setQuestDraft({ ...questDraft, recurrence: e.target.value as Quest["recurrence"] })}><option value="none">No repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></Field>
          <Field label="Date & time"><input type="datetime-local" value={isoLocal(questDraft.date)} onChange={e => setQuestDraft({ ...questDraft, date: fromLocal(e.target.value) })} /></Field>
          <Field label="Deadline"><input type="datetime-local" value={isoLocal(questDraft.deadline)} onChange={e => setQuestDraft({ ...questDraft, deadline: fromLocal(e.target.value) })} /></Field>
          <Field label="Completion condition" wide><input value={questDraft.completionConditions} onChange={e => setQuestDraft({ ...questDraft, completionConditions: e.target.value })} placeholder="Merljiv uslov za clear" /></Field>
          {(questDraft.type === "Mandatory" || questDraft.type === "Correction") && <Field label="Failure consequence" wide><textarea value={questDraft.failureConsequence} onChange={e => setQuestDraft({ ...questDraft, failureConsequence: e.target.value })} placeholder="Praktična posledica koju si sam definisao" /></Field>}
        </div>
        <footer><button onClick={() => setQuestDraft(null)}>Cancel</button><button className="primary" onClick={saveQuest}>Activate Quest</button></footer>
      </section>
    </div>}
    {ceremony && <div className="modal-backdrop ceremony-backdrop"><section className="ceremony modal"><div className="ceremony-glyph">✦</div><p>{ceremony.eyebrow}</p><h2>{ceremony.title}</h2><span>{ceremony.text}</span><button className="primary" onClick={() => setCeremony(null)}>Continue</button></section></div>}
    {confirmAction && <div className="modal-backdrop"><section className="modal confirm-modal"><div className="warning-mark">!</div><h2>{confirmAction.title}</h2><p>{confirmAction.text}</p><footer><button onClick={() => setConfirmAction(null)}>Odustani</button><button className="danger" onClick={confirmAction.action}>Potvrdi</button></footer></section></div>}
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </div>;
}
