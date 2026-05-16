import { describe, expect, it } from "vitest";
import { buildAuthorNetwork, extractAuthorsFromFirstPage, findAuthorProfile } from "@/services/AuthorNetworkService";
import type { PdfTextItem } from "@/pdf/pdfTypes";

function item(text: string, top: number, left = 0): PdfTextItem {
  return {
    text,
    left,
    top,
    width: text.length * 8,
    height: 10,
    fontName: "serif",
    fontSize: 10,
    rectPct: { left: 0, top: 0, width: 0.1, height: 0.1 },
  };
}

describe("AuthorNetworkService", () => {
  it("extracts simple author lines from first page text", () => {
    const authors = extractAuthorsFromFirstPage([
      item("A Great Paper", 10),
      item("Alice Smith, Bob Jones", 30),
      item("Department of Computer Science", 45),
      item("Abstract", 70),
    ]);
    expect(authors).toContain("Alice Smith");
    expect(authors).toContain("Bob Jones");
  });

  it("extracts author lines with affiliation and equal-contribution markers", () => {
    const authors = extractAuthorsFromFirstPage([
      item("SE-Agent: Self-Evolution Trajectory Optimization in Multi-Step Reasoning with LLM-Based Agents", 10),
      item("Jiaye Lin1,* Yifu Guo2,* Yuzhen Han3 Sen Hu4 Ziyi Ni5,6", 30),
      item("Licheng Wang5 Mingguang Chen7 Hongzhang Liu4,8 Ronghao Chen4", 44),
      item("Yangfan He9 Daxin Jiang2 Binxing Jiao2 Chen Hu2,† Huacan Wang5,†,∗", 58),
      item("1THU 2StepFun 3UofT 4PKU 5UCAS 6CASIA 7UCR 8USYD 9UMN", 76),
      item("Abstract", 98),
    ]);
    expect(authors).toEqual([
      "Jiaye Lin",
      "Yifu Guo",
      "Yuzhen Han",
      "Sen Hu",
      "Ziyi Ni",
      "Licheng Wang",
      "Mingguang Chen",
      "Hongzhang Liu",
      "Ronghao Chen",
      "Yangfan He",
      "Daxin Jiang",
      "Binxing Jiao",
      "Chen Hu",
      "Huacan Wang",
    ]);
  });

  it("builds coauthor relationships across local documents", () => {
    const network = buildAuthorNetwork([
      { document_id: "d1", title: "One", pageTextItems: { 0: [item("Alice Smith, Bob Jones", 20)] } },
      { document_id: "d2", title: "Two", pageTextItems: { 0: [item("Alice Smith, Carol Lee", 20)] } },
    ]);
    const alice = findAuthorProfile(network, "Alice Smith");
    expect(alice?.local_paper_count).toBe(2);
    expect(alice?.coauthors.map((edge) => edge.name)).toEqual(["Bob Jones", "Carol Lee"]);
  });
});
