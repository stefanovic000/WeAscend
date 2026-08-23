import { type WeAscendState, type XpTransaction } from "@weascend/shared";

export function transactionTitle(state: WeAscendState, transaction: XpTransaction, sr: boolean) {
  return state.quests.find(quest => quest.id === transaction.questId)?.title ?? (sr ? "Obrisan quest" : "Deleted quest");
}

export function transactionPath(state: WeAscendState, transaction: XpTransaction, sr: boolean) {
  const attribute = state.attributes.find(item => item.id === transaction.attributeId)?.name ?? (sr ? "Obrisana oblast" : "Deleted area");
  const skill = state.skills.find(item => item.id === transaction.skillId)?.name ?? (sr ? "Obrisan skill" : "Deleted skill");
  return `${attribute} › ${skill}`;
}

export function formatHistoryDate(value: string, language: "en" | "sr") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(language === "sr" ? "sr-RS" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
