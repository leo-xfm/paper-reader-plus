import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseSimpleTexLatexOcrResponse,
  requestSimpleTexLatexOcr,
  requestSimpleTexLatexOcrDataUrl,
} from "../electron/services/SimpleTexOcrService";

describe("SimpleTexOcrService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts image multipart data with the SimpleTex token", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({
      status: true,
      res: { latex: "a^{2}-b^{2}", conf: 0.95 },
      request_id: "tr_test",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestSimpleTexLatexOcr({ simpletex_ocr_token: "token-1" }, {
      data: Buffer.from("png"),
      mimeType: "image/png",
      fileName: "formula.png",
    });

    expect(result).toEqual({ latex: "a^{2}-b^{2}", conf: 0.95, request_id: "tr_test" });
    expect(fetchMock).toHaveBeenCalledWith("https://server.simpletex.cn/api/latex_ocr_turbo", expect.objectContaining({
      method: "POST",
      headers: { token: "token-1" },
      body: expect.any(FormData),
    }));
  });

  it("accepts renderer image data URLs", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: true,
      res: { latex: "x+y" },
      request_id: "tr_data_url",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestSimpleTexLatexOcrDataUrl(
      { simpletex_ocr_token: "token-1" },
      `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
    );

    expect(result.latex).toBe("x+y");
  });

  it("maps SimpleTex error codes to user-facing messages", () => {
    expect(() => parseSimpleTexLatexOcrResponse({
      status: false,
      err_info: "req_unauthorized",
      request_id: "tr_bad",
    })).toThrow("authorization failed");
  });

  it("rejects empty latex results", () => {
    expect(() => parseSimpleTexLatexOcrResponse({
      status: true,
      res: { latex: " " },
      request_id: "tr_empty",
    })).toThrow("empty formula");
  });

  it("requires a configured token", async () => {
    await expect(requestSimpleTexLatexOcr({ simpletex_ocr_token: "" }, {
      data: Buffer.from("png"),
      mimeType: "image/png",
    })).rejects.toThrow("token is not configured");
  });
});
