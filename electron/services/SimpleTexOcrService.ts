import type { Settings } from "./SettingsTypes.js";

export type SimpleTexLatexOcrResponse = {
  latex: string;
  conf?: number;
  request_id?: string;
};

const SIMPLETEX_LATEX_OCR_TURBO_URL = "https://server.simpletex.cn/api/latex_ocr_turbo";

const ERROR_MESSAGES: Record<string, string> = {
  api_not_find: "SimpleTex OCR API was not found.",
  req_method_error: "SimpleTex OCR request method is invalid.",
  req_unauthorized: "SimpleTex OCR authorization failed. Check the UAT token.",
  resource_no_valid: "SimpleTex OCR account has no available quota or balance.",
  image_missing: "SimpleTex OCR did not receive an image file.",
  image_oversize: "SimpleTex OCR image is too large.",
  sever_closed: "SimpleTex OCR server is unavailable or under maintenance.",
  server_error: "SimpleTex OCR server error.",
  exceed_max_qps: "SimpleTex OCR QPS limit exceeded. Try again later.",
  exceed_max_ccy: "SimpleTex OCR concurrency limit exceeded. Try again later.",
  server_inference_error: "SimpleTex OCR inference failed.",
  image_proc_error: "SimpleTex OCR could not process the uploaded image.",
  invalid_param: "SimpleTex OCR request has invalid parameters.",
  too_many_file: "SimpleTex OCR received too many files.",
  no_file_error: "SimpleTex OCR did not receive a file.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function imageFromDataUrl(dataUrl: string) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error("Invalid image data for SimpleTex OCR.");
  return {
    mimeType: match[1] === "image/jpg" ? "image/jpeg" : match[1],
    data: Buffer.from(match[2], "base64"),
  };
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return ".jpg";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  return ".png";
}

function simpleTexErrorMessage(data: unknown, fallback: string) {
  if (!isRecord(data)) return fallback;
  const code = typeof data.err_info === "string"
    ? data.err_info
    : typeof data.error === "string"
      ? data.error
      : typeof data.code === "string"
        ? data.code
        : "";
  const message = typeof data.message === "string"
    ? data.message
    : typeof data.msg === "string"
      ? data.msg
      : "";
  return ERROR_MESSAGES[code] || message || (code ? `SimpleTex OCR failed: ${code}` : fallback);
}

export function parseSimpleTexLatexOcrResponse(data: unknown): SimpleTexLatexOcrResponse {
  if (!isRecord(data)) throw new Error("SimpleTex OCR returned an invalid response.");
  if (data.status !== true) {
    throw new Error(simpleTexErrorMessage(data, "SimpleTex OCR failed."));
  }
  const res = isRecord(data.res) ? data.res : {};
  const latex = typeof res.latex === "string" ? res.latex.trim() : "";
  if (!latex) throw new Error("SimpleTex OCR returned an empty formula.");
  const conf = typeof res.conf === "number" ? res.conf : undefined;
  return {
    latex,
    conf,
    request_id: typeof data.request_id === "string" ? data.request_id : undefined,
  };
}

export async function requestSimpleTexLatexOcr(
  settings: Pick<Settings, "simpletex_ocr_token">,
  input: { data: Buffer; mimeType: string; fileName?: string },
): Promise<SimpleTexLatexOcrResponse> {
  const token = settings.simpletex_ocr_token.trim();
  if (!token) throw new Error("SimpleTex OCR token is not configured.");
  if (!input.data.length) throw new Error("SimpleTex OCR image is empty.");

  const form = new FormData();
  const fileName = input.fileName || `formula${extensionForMime(input.mimeType)}`;
  const uploadBytes = new Uint8Array(input.data.length);
  uploadBytes.set(input.data);
  form.append("file", new Blob([uploadBytes], { type: input.mimeType }), fileName);

  const response = await fetch(SIMPLETEX_LATEX_OCR_TURBO_URL, {
    method: "POST",
    headers: { token },
    body: form,
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(simpleTexErrorMessage(data, text || `SimpleTex OCR failed: ${response.status}`));
  }
  return parseSimpleTexLatexOcrResponse(data);
}

export async function requestSimpleTexLatexOcrDataUrl(
  settings: Pick<Settings, "simpletex_ocr_token">,
  dataUrl: string,
  fileName?: string,
) {
  const image = imageFromDataUrl(dataUrl);
  return requestSimpleTexLatexOcr(settings, { ...image, fileName });
}
