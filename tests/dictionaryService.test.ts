import { describe, expect, it } from "vitest";
import { dictionaryEntryMatchesText, normalizeDictionaryTerm } from "@/services/DictionaryService";

describe("DictionaryService", () => {
  it("normalizes dictionary terms", () => {
    expect(normalizeDictionaryTerm(" Differential   Privacy! ")).toBe("differential privacy");
  });

  it("matches whole multi-word terms in PDF text windows", () => {
    expect(dictionaryEntryMatchesText(
      { normalized_term: "differential privacy" },
      "This paper studies differential privacy guarantees.",
    )).toBe(true);
    expect(dictionaryEntryMatchesText(
      { normalized_term: "differential privacy" },
      "The differential equation has privacy concerns.",
    )).toBe(false);
  });
});
