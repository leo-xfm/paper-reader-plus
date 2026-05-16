import { describe, expect, it } from "vitest";
import { renderTemplate } from "../electron/services/PromptTemplateService";

describe("PromptTemplateService", () => {
  it("renders variables, defaults, and simple conditions", () => {
    const rendered = renderTemplate(
      "Hello {{ name | default('reader') }}{% if language and language != 'English' %} in {{ language }}{% endif %}",
      { language: "Chinese" },
    );
    expect(rendered).toBe("Hello reader in Chinese");
  });

  it("omits false conditional blocks", () => {
    const rendered = renderTemplate("{% if language and language != 'English' %}Translate{% endif %}", { language: "English" });
    expect(rendered).toBe("");
  });
});
