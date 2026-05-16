import { describe, expect, it } from "vitest";
import { messages } from "../src/i18n/messages";
import { resolveUiLanguage, translate } from "../src/i18n";

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
});

