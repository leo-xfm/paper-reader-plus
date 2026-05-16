import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getAppPath: () => process.cwd(),
  },
}));

describe("DocsConfigService", () => {
  it("does not read key.json or key.example.json as default credentials", async () => {
    const service = await import("../electron/services/DocsConfigService");
    expect(service.resolveDocsPath("key.example.json").endsWith("docs\\key.example.json") || service.resolveDocsPath("key.example.json").endsWith("docs/key.example.json")).toBe(true);
    expect(service.readDocsKeyConfig()).toEqual({});
  });
});
