import type { DictionaryEntry } from "@/types";

export function normalizeDictionaryTerm(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function dictionaryEntryMatchesText(entry: Pick<DictionaryEntry, "normalized_term">, text: string) {
  const normalizedText = normalizeDictionaryTerm(text);
  if (!entry.normalized_term || !normalizedText.includes(entry.normalized_term)) return false;
  const pattern = new RegExp(`(^|\\s)${entry.normalized_term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i");
  return pattern.test(normalizedText);
}
