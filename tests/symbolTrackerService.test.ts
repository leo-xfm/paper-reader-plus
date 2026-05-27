import { describe, expect, it } from "vitest";
import { applyAiSymbolCompletion, applySymbolRefresh, displaySymbolText, extractSymbolsFromLatex, extractSymbolsFromPdfPages, findSymbolDefinition, mergeSymbolDefinitions, normalizeSymbol, parseAiSymbolDefinitions, renderSimpleLatexToMarkdown } from "@/services/SymbolTrackerService";
import type { PdfTextItem } from "@/pdf/pdfTypes";

function pdfItem(text: string): PdfTextItem {
  return {
    text,
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    fontName: "serif",
    fontSize: 10,
    rectPct: { left: 0, top: 0, width: 0.1, height: 0.1 },
  };
}

describe("SymbolTrackerService", () => {
  it("extracts symbol definitions from LaTeX prose around math", () => {
    const definitions = extractSymbolsFromLatex("Let $x$ denotes the hidden state used by the decoder.");
    expect(findSymbolDefinition(definitions, "x")?.definition).toContain("hidden state");
  });

  it("keeps LaTeX text commands readable in symbol labels", () => {
    const definitions = extractSymbolsFromLatex("Let $\\text{TaskCompletion}$ denotes the task completion score.");
    expect(findSymbolDefinition(definitions, "TaskCompletion")?.symbol).toBe("TaskCompletion");
    expect(displaySymbolText("\\textTaskCompletion")).toBe("TaskCompletion");
    expect(normalizeSymbol("\\text{TaskCompletion}")).toBe("taskcompletion");
  });

  it("extracts abbreviations from loaded PDF text", () => {
    const definitions = extractSymbolsFromPdfPages({
      0: [pdfItem("We use RAG (retrieval augmented generation) for context.")],
    });
    expect(findSymbolDefinition(definitions, "RAG")?.definition).toContain("retrieval augmented generation");
    expect(findSymbolDefinition(definitions, "RAG")?.rects_pct).toHaveLength(1);
  });

  it("prefers LaTeX definitions over PDF fallbacks", () => {
    const merged = mergeSymbolDefinitions(
      extractSymbolsFromPdfPages({ 0: [pdfItem("x is the PDF fallback definition.")] }),
      extractSymbolsFromLatex("$x$ is defined as the latent variable."),
    );
    expect(findSymbolDefinition(merged, "x")?.source).toBe("latex");
  });

  it("keeps deleted saved symbols hidden when generated fallbacks still exist", () => {
    const merged = mergeSymbolDefinitions(
      [{ symbol: "x", normalized_symbol: "x", kind: "symbol", definition: "", source: "latex", confidence: 1, deleted: true }],
      extractSymbolsFromLatex("$x$ is defined as the latent variable."),
    );
    expect(findSymbolDefinition(merged, "x")).toBeNull();
  });

  it("keeps saved favorites when merging regenerated symbols", () => {
    const merged = mergeSymbolDefinitions(
      [{ symbol: "x", normalized_symbol: "x", kind: "symbol", definition: "saved", source: "pdf", confidence: 0.5, favorite: true }],
      extractSymbolsFromLatex("$x$ is defined as the latent variable."),
    );
    expect(findSymbolDefinition(merged, "x")?.favorite).toBe(true);
    expect(findSymbolDefinition(merged, "x")?.definition).toContain("latent variable");
  });

  it("preserves user state when applying a symbol refresh", () => {
    const refreshed = applySymbolRefresh(
      [
        { symbol: "x", normalized_symbol: "x", kind: "symbol", definition: "edited", source: "pdf", confidence: 1, user_modified: true },
        { symbol: "y", normalized_symbol: "y", kind: "symbol", definition: "old favorite", source: "pdf", confidence: 1, favorite: true },
        { symbol: "z", normalized_symbol: "z", kind: "symbol", definition: "", source: "pdf", confidence: 1, deleted: true },
      ],
      [
        { symbol: "x", normalized_symbol: "x", kind: "symbol", definition: "generated x", source: "latex", confidence: 1 },
        { symbol: "y", normalized_symbol: "y", kind: "symbol", definition: "generated y", source: "latex", confidence: 1 },
        { symbol: "z", normalized_symbol: "z", kind: "symbol", definition: "generated z", source: "latex", confidence: 1 },
      ],
      "preserve-user-state",
    );
    const visible = mergeSymbolDefinitions(refreshed);
    expect(findSymbolDefinition(visible, "x")?.definition).toBe("edited");
    expect(findSymbolDefinition(visible, "y")?.definition).toBe("generated y");
    expect(findSymbolDefinition(visible, "y")?.favorite).toBe(true);
    expect(findSymbolDefinition(visible, "z")).toBeNull();
  });

  it("resets user state when applying a full symbol refresh", () => {
    const refreshed = applySymbolRefresh(
      [{ symbol: "x", normalized_symbol: "x", kind: "symbol", definition: "edited", source: "pdf", confidence: 1, favorite: true, user_modified: true }],
      [{ symbol: "x", normalized_symbol: "x", kind: "symbol", definition: "generated", source: "latex", confidence: 1 }],
      "reset",
    );
    const symbol = findSymbolDefinition(refreshed, "x");
    expect(symbol?.definition).toBe("generated");
    expect(symbol?.favorite).toBe(false);
    expect(symbol?.user_modified).toBe(false);
  });

  it("parses AI symbol JSON from plain and fenced responses", () => {
    const plain = parseAiSymbolDefinitions('[{"symbol":"L","kind":"symbol","definition":"loss function","paragraph":"L denotes loss.","page_number":2,"confidence":0.91}]');
    expect(findSymbolDefinition(plain, "L")?.source).toBe("ai");
    expect(findSymbolDefinition(plain, "L")?.page_index).toBe(1);
    const fenced = parseAiSymbolDefinitions('```json\n[{"symbol":"RAG","kind":"abbreviation","definition":"retrieval augmented generation"}]\n```');
    expect(findSymbolDefinition(fenced, "RAG")?.kind).toBe("abbreviation");
  });

  it("ignores invalid AI symbol rows", () => {
    const definitions = parseAiSymbolDefinitions('[{"symbol":"","definition":"missing name"},{"symbol":"x","definition":""},{"symbol":"y","definition":"valid"}]');
    expect(definitions).toHaveLength(1);
    expect(definitions[0].symbol).toBe("y");
  });

  it("completes missing symbols from AI without overwriting existing definitions", () => {
    const completed = applyAiSymbolCompletion(
      [
        { symbol: "x", normalized_symbol: "x", kind: "symbol", definition: "existing", source: "pdf", confidence: 0.4 },
        { symbol: "y", normalized_symbol: "y", kind: "symbol", definition: "", source: "pdf", confidence: 0.4 },
      ],
      [
        { symbol: "x", normalized_symbol: "x", kind: "symbol", definition: "ai x", source: "ai", confidence: 0.9 },
        { symbol: "y", normalized_symbol: "y", kind: "symbol", definition: "ai y", source: "ai", confidence: 0.9 },
        { symbol: "z", normalized_symbol: "z", kind: "symbol", definition: "ai z", source: "ai", confidence: 0.9 },
      ],
    );
    expect(findSymbolDefinition(completed, "x")?.definition).toBe("existing");
    expect(findSymbolDefinition(completed, "y")?.definition).toBe("ai y");
    expect(findSymbolDefinition(completed, "z")?.source).toBe("ai");
  });

  it("renders simple LaTeX prose to markdown", () => {
    const rendered = renderSimpleLatexToMarkdown("\\section{Setup}\\textit{state} \\texttt{code} Let \\mathcal{S} be the state space. $\\mathcal{A}$ is unchanged. \\begin{equation}x^2\\end{equation}");
    expect(rendered).toContain("# Setup");
    expect(rendered).toContain("*state*");
    expect(rendered).toContain("`code`");
    expect(rendered).toContain("$\\mathcal{S}$");
    expect(rendered).toContain("$\\mathcal{A}$");
    expect(rendered).not.toContain("$$\\mathcal{A}$$");
    expect(rendered).toContain("$$");
  });
});
