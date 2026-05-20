import { describe, expect, it } from "vitest";
import { dialogLabel, menuLabel, menuLabelKeys, resolveMenuLanguage } from "../electron/i18n";

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

  it("localizes Electron dialog labels", () => {
    expect(dialogLabel("zh-CN", "dialog.saveClose.message")).toBe("关闭前保存？");
    expect(dialogLabel("zh-CN", "dialog.delete.detail", { title: "Paper" })).toContain("Paper");
    expect(dialogLabel("zh-CN", "button.cancel")).not.toBe(dialogLabel("en-US", "button.cancel"));
  });
});
