import { describe, expect, it } from "vitest";
import {
  extractFormulaCandidatesFromLatex,
  extractFormulaCandidatesFromPdfPages,
  extractPdfFullTextFormulaCandidates,
  parseAiFormulaAnalyses,
} from "../src/services/FormulaAnalysisService";

describe("FormulaAnalysisService", () => {
  it("extracts PDF formula block candidates without deciding importance", () => {
    const candidates = extractFormulaCandidatesFromPdfPages("doc-1", {
      0: [
        { text: "Method", rectPct: { left: 0.1, top: 0.1, width: 0.2, height: 0.02 }, fontSize: 14 },
        { text: "L = x + y", rectPct: { left: 0.2, top: 0.2, width: 0.2, height: 0.02 }, fontSize: 10 },
        { text: "where x is input", rectPct: { left: 0.1, top: 0.26, width: 0.4, height: 0.02 }, fontSize: 10 },
      ],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ document_id: "doc-1", source: "pdf", raw_text: "L = x + y", page_index: 0 });
    expect(candidates[0].context).toContain("where x is input");
  });

  it("extracts display formulas from LaTeX source with context", () => {
    const candidates = extractFormulaCandidatesFromLatex("doc-1", [
      "We optimize the loss.",
      "\\begin{equation}",
      "L(\\theta)=\\sum_i x_i",
      "\\end{equation}",
      "This objective trains the model.",
      "\\[",
      "p(y|x)=\\mathrm{softmax}(Wx)",
      "\\]",
    ].join("\n"));
    expect(candidates.map((candidate) => candidate.source)).toEqual(["latex", "latex"]);
    expect(candidates[0].latex).toContain("\\sum_i");
    expect(candidates[0].context).toContain("optimize");
  });

  it("sends full PDF text blocks to AI for batch extraction", () => {
    const candidates = extractPdfFullTextFormulaCandidates("doc-1", {
      0: [
        { text: "We minimize", rectPct: { left: 0.1, top: 0.1, width: 0.2, height: 0.02 }, fontSize: 10 },
        { text: "the objective", rectPct: { left: 0.32, top: 0.1, width: 0.2, height: 0.02 }, fontSize: 10 },
        { text: "L = x + y", rectPct: { left: 0.2, top: 0.2, width: 0.2, height: 0.02 }, fontSize: 10 },
        { text: "where x is input", rectPct: { left: 0.1, top: 0.26, width: 0.4, height: 0.02 }, fontSize: 10 },
      ],
    });
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.map((candidate) => candidate.raw_text).join(" ")).toContain("We minimize");
    expect(candidates.map((candidate) => candidate.raw_text).join(" ")).toContain("L = x + y");
  });

  it("accepts AI-extracted formula text from a full PDF text block", () => {
    const candidates = extractPdfFullTextFormulaCandidates("doc-1", {
      0: [
        { text: "We minimize the objective L = x + y where x is input.", rectPct: { left: 0.1, top: 0.1, width: 0.7, height: 0.02 }, fontSize: 10 },
      ],
    });
    const analyses = parseAiFormulaAnalyses(JSON.stringify([{
      candidate_id: candidates[0].candidate_id,
      raw_text: "L = x + y",
      latex: "L = x + y",
      analysis: "Defines the objective.",
      importance_score: 0.88,
      confidence: 0.8,
    }]), "doc-1", candidates);
    expect(analyses[0].raw_text).toBe("L = x + y");
    expect(analyses[0].context).toContain("objective");
  });

  it("keeps multiple AI-extracted formulas from one PDF block", () => {
    const candidates = extractPdfFullTextFormulaCandidates("doc-1", {
      0: [
        { text: "We use L = x + y and p(y|x)=softmax(Wx).", rectPct: { left: 0.1, top: 0.1, width: 0.7, height: 0.02 }, fontSize: 10 },
      ],
    });
    const analyses = parseAiFormulaAnalyses(JSON.stringify([
      { candidate_id: candidates[0].candidate_id, raw_text: "L = x + y", latex: "L = x + y", analysis: "Loss.", importance_score: 0.9 },
      { candidate_id: candidates[0].candidate_id, raw_text: "p(y|x)=softmax(Wx)", latex: "p(y|x)=\\mathrm{softmax}(Wx)", analysis: "Probability.", importance_score: 0.85 },
    ]), "doc-1", candidates);
    expect(analyses).toHaveLength(2);
    expect(new Set(analyses.map((formula) => formula.formula_id)).size).toBe(2);
  });

  it("parses AI-selected important formulas into persisted analyses", () => {
    const candidates = extractFormulaCandidatesFromLatex("doc-1", "\\begin{equation}\nL=x+y\n\\end{equation}");
    const analyses = parseAiFormulaAnalyses(JSON.stringify([{
      candidate_id: candidates[0].candidate_id,
      latex: "L=x+y",
      analysis: "Defines the loss.",
      importance_score: 0.95,
      confidence: 0.9,
    }]), "doc-1", candidates);
    expect(analyses).toHaveLength(1);
    expect(analyses[0]).toMatchObject({
      document_id: "doc-1",
      latex: "L=x+y",
      analysis: "Defines the loss.",
      status: "parsed",
      importance_score: 0.95,
    });
  });
});
