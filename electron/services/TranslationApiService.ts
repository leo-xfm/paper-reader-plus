import { createHash, randomInt } from "node:crypto";
import type { Settings } from "./SettingsTypes.js";
import { requestAgentChat, type AgentChatPayload } from "./AgentApiService.js";

export type TranslationPayload = AgentChatPayload & {
  text?: string;
  target_language?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function googleLanguageCode(language: string) {
  const normalized = language.trim().toLowerCase();
  if (["chinese", "中文", "zh", "zh-cn"].includes(normalized)) return "zh-CN";
  if (["english", "英文", "en", "en-us"].includes(normalized)) return "en";
  return language.trim();
}

export function baiduLanguageCode(language: string) {
  const normalized = language.trim().toLowerCase();
  if (["chinese", "中文", "zh", "zh-cn"].includes(normalized)) return "zh";
  if (["english", "英文", "en", "en-us"].includes(normalized)) return "en";
  return language.trim();
}

export function baiduSign(appId: string, query: string, salt: string, appKey: string) {
  return createHash("md5").update(`${appId}${query}${salt}${appKey}`, "utf8").digest("hex");
}

function textFromPayload(payload: TranslationPayload) {
  return String(payload.text || "").trim();
}

function extractGoogleContent(data: unknown) {
  if (!isRecord(data)) return "";
  const translations = Array.isArray(data.translations)
    ? data.translations
    : isRecord(data.data) && Array.isArray(data.data.translations)
      ? data.data.translations
      : [];
  return translations
    .map((item) => isRecord(item) && typeof item.translatedText === "string" ? item.translatedText : "")
    .filter(Boolean)
    .join("\n");
}

function extractBaiduContent(data: unknown) {
  if (!isRecord(data)) return "";
  if (typeof data.error_code === "string" || typeof data.error_code === "number") {
    throw new Error(`Baidu translation failed: ${data.error_code}${data.error_msg ? ` ${data.error_msg}` : ""}`);
  }
  return (Array.isArray(data.trans_result) ? data.trans_result : [])
    .map((item) => isRecord(item) && typeof item.dst === "string" ? item.dst : "")
    .filter(Boolean)
    .join("\n");
}

async function requestGoogleTranslation(settings: Settings, payload: TranslationPayload) {
  const text = textFromPayload(payload);
  if (!settings.google_project_id) throw new Error("Google project id is not configured.");
  if (!settings.google_api_key) throw new Error("Google API key is not configured.");
  const target = googleLanguageCode(String(payload.target_language || settings.translator_target_language || "Chinese"));
  const url = `https://translation.googleapis.com/v3/projects/${encodeURIComponent(settings.google_project_id)}:translateText?key=${encodeURIComponent(settings.google_api_key)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [text],
      sourceLanguageCode: "auto",
      targetLanguageCode: target,
      mimeType: "text/plain",
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Google translation failed: ${response.status}`);
  }
  const content = extractGoogleContent(await response.json()).trim();
  if (!content) throw new Error("Google translation returned an empty response.");
  return { content };
}

async function requestBaiduTranslation(settings: Settings, payload: TranslationPayload) {
  const text = textFromPayload(payload);
  if (!settings.baidu_app_id) throw new Error("Baidu app id is not configured.");
  if (!settings.baidu_app_key) throw new Error("Baidu app key is not configured.");
  const salt = String(randomInt(32768, 65536));
  const target = baiduLanguageCode(String(payload.target_language || settings.translator_target_language || "Chinese"));
  const params = new URLSearchParams({
    q: text,
    from: "auto",
    to: target,
    appid: settings.baidu_app_id,
    salt,
    sign: baiduSign(settings.baidu_app_id, text, salt, settings.baidu_app_key),
  });
  const response = await fetch("https://fanyi-api.baidu.com/api/trans/vip/translate", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Baidu translation failed: ${response.status}`);
  }
  const content = extractBaiduContent(await response.json()).trim();
  if (!content) throw new Error("Baidu translation returned an empty response.");
  return { content };
}

export async function requestTranslation(settings: Settings, payload: TranslationPayload) {
  const text = textFromPayload(payload);
  if (!text) throw new Error("No selected text to translate.");
  if (settings.translator_mode === "ai") {
    return requestAgentChat(settings, { ...payload, task: "translate" });
  }
  if (settings.translation_provider === "baidu") return requestBaiduTranslation(settings, payload);
  return requestGoogleTranslation(settings, payload);
}
