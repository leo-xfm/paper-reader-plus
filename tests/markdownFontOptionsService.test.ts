import { describe, expect, it } from "vitest";
import { markdownBodyFontFamily } from "@/services/MarkdownFontOptionsService";

describe("MarkdownFontOptionsService", () => {
  it("combines western and Chinese body font stacks in order", () => {
    expect(markdownBodyFontFamily("Aptos", "微软雅黑")).toBe(
      '"Aptos", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif',
    );
    expect(markdownBodyFontFamily("Georgia", "宋体")).toBe(
      '"Georgia", "SimSun", "Songti SC", "Noto Serif CJK SC", Georgia, "Times New Roman", serif',
    );
  });

  it("uses inherited western font and system Chinese fallbacks for current", () => {
    expect(markdownBodyFontFamily("current", "current")).toBe(
      'inherit, "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif',
    );
  });
});
