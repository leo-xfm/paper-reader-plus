import { createHash, randomInt } from "node:crypto";
import { request as httpsRequest, Agent as HttpsAgent } from "node:https";
import { connect as netConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";
import type { RequestOptions } from "node:https";
import type { Duplex } from "node:stream";
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

function proxyUrl(settings?: Settings) {
  if (settings?.network_proxy_enabled && settings.network_proxy_url.trim()) return settings.network_proxy_url.trim();
  return process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY || "";
}

class HttpConnectHttpsAgent extends HttpsAgent {
  constructor(private readonly proxy: URL, private readonly target: URL) {
    super();
  }

  override createConnection(_options: RequestOptions, callback?: (error: Error | null, stream: Duplex) => void) {
    const proxyPort = Number.parseInt(this.proxy.port || "80", 10);
    const socket = netConnect(proxyPort, this.proxy.hostname);
    socket.setTimeout(45_000);
    socket.once("connect", () => {
      const targetHost = `${this.target.hostname}:${this.target.port || "443"}`;
      const auth = this.proxy.username
        ? `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(this.proxy.username)}:${decodeURIComponent(this.proxy.password)}`).toString("base64")}\r\n`
        : "";
      socket.write(`CONNECT ${targetHost} HTTP/1.1\r\nHost: ${targetHost}\r\n${auth}Connection: close\r\n\r\n`);
    });

    let response = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      response = Buffer.concat([response, chunk]);
      const headerEnd = response.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      socket.off("data", onData);
      const header = response.subarray(0, headerEnd).toString("utf8");
      if (!/^HTTP\/1\.[01] 2\d\d\b/.test(header)) {
        socket.destroy(new Error("Proxy CONNECT failed"));
        return;
      }
      const secureSocket = tlsConnect({ socket, servername: this.target.hostname });
      callback?.(null, secureSocket);
    };
    socket.on("data", onData);
    socket.once("timeout", () => socket.destroy(new Error("Timed out connecting to proxy")));
    socket.once("error", (error) => callback?.(error, socket));
    return null;
  }
}

export function googleTranslationProxyAgentFor(url: string, settings?: Settings) {
  const rawProxy = proxyUrl(settings);
  if (!rawProxy || !/^https:\/\//i.test(url)) return undefined;
  const target = new URL(url);
  const proxy = new URL(rawProxy);
  if (proxy.protocol !== "http:") return undefined;
  return new HttpConnectHttpsAgent(proxy, target);
}

async function postJsonWithHttps(url: string, body: unknown, settings: Settings) {
  const bodyText = JSON.stringify(body);
  return new Promise<{ statusCode: number; text: string }>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyText),
        },
        timeout: 45_000,
        agent: googleTranslationProxyAgentFor(url, settings),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          receivedBytes += chunk.length;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode || 0,
            text: Buffer.concat(chunks, receivedBytes).toString("utf8"),
          });
        });
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new Error("Timed out connecting to Google Translation.")));
    request.on("error", reject);
    request.write(bodyText);
    request.end();
  });
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
  const response = await postJsonWithHttps(url, {
    contents: [text],
    sourceLanguageCode: "auto",
    targetLanguageCode: target,
    mimeType: "text/plain",
  }, settings);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(response.text || `Google translation failed: ${response.statusCode}`);
  }
  const content = extractGoogleContent(JSON.parse(response.text)).trim();
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
