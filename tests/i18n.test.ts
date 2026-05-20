import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveUiLanguage, translate } from "../src/i18n";
import { messages, zhCNOverrides } from "../src/i18n/messages";

function staticI18nKeysFromSource() {
  const keys = new Set<string>();
  const files = execSync("rg --files src electron", { cwd: process.cwd(), encoding: "utf8" }).trim().split(/\r?\n/);
  for (const file of files) {
    if (!/\.(ts|vue)$/.test(file)) continue;
    const source = readFileSync(join(process.cwd(), file), "utf8");
    for (const pattern of [
      /\bt\(\s*["']([^"']+)["']/g,
      /\btranslate\(\s*[^,]+,\s*["']([^"']+)["']/g,
    ]) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source))) keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

describe("i18n", () => {
  it("keeps English and Chinese dictionaries aligned", () => {
    expect(Object.keys(messages["zh-CN"]).sort()).toEqual(Object.keys(messages["en-US"]).sort());
  });

  it("interpolates parameters", () => {
    expect(translate("en-US", "annotation.count", { visible: 2, total: 5 })).toBe("2 / 5 annotations");
    expect(translate("zh-CN", "preview.linkToPage", { page: 7 })).toBe("PDF 内部链接到第 7 页。");
  });

  it("resolves system language from locale", () => {
    expect(resolveUiLanguage("system", "zh-CN")).toBe("zh-CN");
    expect(resolveUiLanguage("system", "en-US")).toBe("en-US");
    expect(resolveUiLanguage("zh-CN", "en-US")).toBe("zh-CN");
  });

  it("keeps recently added chrome labels localized in Chinese", () => {
    const keys = [
      "common.auto",
      "library.openFiles",
      "library.closeFile",
      "library.expandSidebar",
      "library.collapseSidebar",
      "library.readermHistory",
      "library.readerpHistory",
      "dictionary.closePreview",
      "panel.expand",
      "symbol.kind.symbol",
      "symbol.kind.abbreviation",
    ] as const;

    for (const key of keys) {
      expect(translate("zh-CN", key)).not.toBe(translate("en-US", key));
    }
  });

  it("does not rely on English fallback for statically used Chinese UI keys", () => {
    const missing = staticI18nKeysFromSource().filter((key) => !(key in zhCNOverrides));
    expect(missing).toEqual([]);
  });
});
