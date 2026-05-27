import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    electronMock.handlers.set(channel, handler);
  }),
  on: vi.fn(),
}));

vi.mock("electron", () => ({
  clipboard: { writeImage: vi.fn() },
  ipcMain: {
    handle: electronMock.handle,
    on: electronMock.on,
  },
  nativeImage: { createFromDataURL: vi.fn(() => ({})) },
}));

vi.mock("../electron/appMenu.js", () => ({
  createApplicationMenu: vi.fn(),
}));

vi.mock("../electron/services/AgentApiService.js", () => ({
  requestAgentChat: vi.fn(),
  streamAgentChatDeltas: vi.fn(),
}));

vi.mock("../electron/services/HelpWindowService.js", () => ({
  openHelpWindow: vi.fn(),
}));

vi.mock("../electron/services/DocsConfigService.js", () => ({
  listTemplateStatus: vi.fn(() => []),
}));

vi.mock("../electron/services/FileAssociationService.js", () => ({
  getFileAssociationStatus: vi.fn(),
  registerFileAssociation: vi.fn(),
  registerFileAssociations: vi.fn(),
  unregisterFileAssociation: vi.fn(),
}));

vi.mock("../electron/services/SimpleTexOcrService.js", () => ({
  requestSimpleTexLatexOcrDataUrl: vi.fn(),
}));

vi.mock("../electron/services/TranslationApiService.js", () => ({
  requestTranslation: vi.fn(),
}));

describe("settings AI IPC", () => {
  beforeEach(() => {
    electronMock.handlers.clear();
    electronMock.handle.mockClear();
    electronMock.on.mockClear();
    vi.resetModules();
  });

  it("preserves long analysis prompt templates when saving settings", async () => {
    const { registerSettingsAiIpc } = await import("../electron/ipc/settingsAiIpc");
    const current = {
      symbol_template: "symbol fallback",
      formula_template: "formula fallback",
    };
    const ctx = {
      getSettings: () => current,
      store: { settings: current },
      saveStore: vi.fn(),
      window: { webContents: { send: vi.fn() } },
      clampAiMaxOutputTokens: (value: unknown) => Number(value) || 16000,
      clampSummaryFigureAttachmentLimit: (value: unknown) => Number(value) || 10,
      clampSummaryTextCharLimit: (value: unknown) => Number(value) || 120000,
    };

    registerSettingsAiIpc(ctx as never);
    const update = electronMock.handlers.get("settings:update");
    expect(update).toBeDefined();

    const longSymbolTemplate = `${"symbol ".repeat(22000)}tail-symbol`;
    const longFormulaTemplate = `${"formula ".repeat(22000)}tail-formula`;
    const next = update?.({}, {
      symbol_template: longSymbolTemplate,
      formula_template: longFormulaTemplate,
    }) as typeof current;

    expect(next.symbol_template).toBe(longSymbolTemplate);
    expect(next.formula_template).toBe(longFormulaTemplate);
    expect(next.symbol_template.endsWith("tail-symbol")).toBe(true);
    expect(next.formula_template.endsWith("tail-formula")).toBe(true);
    expect((next as Record<string, unknown>).pdf_formula_hover_enabled).toBe(false);
  });
});
