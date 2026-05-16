import { describe, expect, it } from "vitest";
import { menuLabel, menuLabelKeys, resolveMenuLanguage } from "../electron/i18n";

describe("Electron menu i18n", () => {
  it("resolves menu language from settings and system locale", () => {
    expect(resolveMenuLanguage("system", "zh-CN")).toBe("zh-CN");
    expect(resolveMenuLanguage("system", "en-US")).toBe("en-US");
    expect(resolveMenuLanguage("en-US", "zh-CN")).toBe("en-US");
  });

  it("generates non-empty labels in both languages", () => {
    for (const key of menuLabelKeys()) {
      expect(menuLabel("en-US", key)).toBeTruthy();
      expect(menuLabel("zh-CN", key)).toBeTruthy();
    }
  });
});

