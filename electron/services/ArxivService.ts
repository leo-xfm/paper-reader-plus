import { Agent as HttpsAgent, get as httpsGet } from "node:https";
import { connect as netConnect } from "node:net";
import { basename } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { gunzipSync } from "node:zlib";
import type { RequestOptions } from "node:https";
import type { Duplex } from "node:stream";
import type { Settings } from "./SettingsTypes.js";

export type ArxivDownloadProgress = {
  label: string;
  receivedBytes: number;
  totalBytes?: number;
};

export type ArxivProgress = {
  phase: "checking" | "downloading-pdf" | "downloading-source" | "extracting-source" | "saving" | "done";
  status: string;
  receivedBytes?: number;
  totalBytes?: number;
  percent?: number;
};

type FetchArxivBufferOptions = {
  onProgress?: (progress: ArxivDownloadProgress) => void;
  settings?: Settings;
};

const ARXIV_REQUEST_TIMEOUT_MS = 45_000;

function timeoutSignal() {
  return AbortSignal.timeout(ARXIV_REQUEST_TIMEOUT_MS);
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
    socket.setTimeout(ARXIV_REQUEST_TIMEOUT_MS);
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

function proxyAgentFor(url: string, settings?: Settings) {
  const rawProxy = proxyUrl(settings);
  if (!rawProxy || !/^https:\/\//i.test(url)) return undefined;
  const target = new URL(url);
  const proxy = new URL(rawProxy);
  if (proxy.protocol !== "http:") return undefined;
  return new HttpConnectHttpsAgent(proxy, target);
}

export function normalizeArxivId(value: string) {
  const clean = value.trim().replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf|e-print)\//i, "").replace(/\.pdf$/i, "");
  if (!/^(?:[a-z-]+\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?$/i.test(clean)) {
    throw new Error("Invalid arXiv ID. Use values like 2401.12345 or cs/9901001.");
  }
  return clean;
}

export function arxivProgress(
  phase: ArxivProgress["phase"],
  status: string,
  progress?: ArxivDownloadProgress,
): ArxivProgress {
  const totalBytes = progress?.totalBytes;
  const receivedBytes = progress?.receivedBytes;
  const percent = totalBytes && receivedBytes !== undefined
    ? Math.max(0, Math.min(100, Math.round((receivedBytes / totalBytes) * 100)))
    : undefined;
  return { phase, status, receivedBytes, totalBytes, percent };
}

export async function verifyArxivEntry(arxivId: string, settings?: Settings) {
  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`;
  try {
    const buffer = await fetchArxivBuffer(url, "arXiv entry", { settings });
    const text = buffer.toString("utf8");
    if (!/<entry\b/i.test(text)) throw new Error(`arXiv entry not found: ${arxivId}`);
  } catch (cause) {
    if (cause instanceof Error && /not found|Failed to check/.test(cause.message)) throw cause;
  }
}

export async function fetchArxivBuffer(url: string, label: string, options: FetchArxivBufferOptions = {}) {
  return new Promise<Buffer>((resolve, reject) => {
    const request = httpsGet(
      url,
      { headers: { "User-Agent": "PaperReaderPlus/0.2" }, timeout: ARXIV_REQUEST_TIMEOUT_MS, agent: proxyAgentFor(url, options.settings) },
      (response) => {
        const statusCode = response.statusCode || 0;
        const location = response.headers.location;
        if (statusCode >= 300 && statusCode < 400 && location) {
          response.resume();
          fetchArxivBuffer(new URL(location, url).toString(), label, options).then(resolve, reject);
          return;
        }
        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`Failed to download ${label}: ${statusCode}`));
          return;
        }

        const totalBytesHeader = response.headers["content-length"];
        const totalBytes = typeof totalBytesHeader === "string" ? Number.parseInt(totalBytesHeader, 10) : undefined;
        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          receivedBytes += chunk.length;
          options.onProgress?.({ label, receivedBytes, totalBytes });
        });
        response.on("end", () => resolve(Buffer.concat(chunks, receivedBytes)));
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new Error(`Timed out downloading ${label}`)));
    request.on("error", reject);
  });
}

function maybeTextSource(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 2048)).toString("utf8");
  if (sample.includes("\\documentclass") || sample.includes("\\begin{document}") || sample.includes("\\section")) {
    return buffer.toString("utf8");
  }
  return "";
}

function stripNulls(value: Buffer) {
  return value.toString("utf8").replace(/\0+$/g, "").trim();
}

function isProbablyTar(buffer: Buffer) {
  return buffer.length > 512 && buffer.subarray(257, 263).toString("utf8").startsWith("ustar");
}

function tarSize(header: Buffer) {
  const raw = stripNulls(header.subarray(124, 136)).replace(/[^0-7]/g, "");
  return raw ? Number.parseInt(raw, 8) : 0;
}

function extractTarFiles(buffer: Buffer) {
  const files: Array<{ name: string; data: Buffer }> = [];
  for (let offset = 0; offset + 512 <= buffer.length;) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = stripNulls(header.subarray(0, 100));
    const prefix = stripNulls(header.subarray(345, 500));
    const type = stripNulls(header.subarray(156, 157));
    const size = tarSize(header);
    offset += 512;
    const fileName = prefix ? `${prefix}/${name}` : name;
    if (fileName && (!type || type === "0")) {
      files.push({ name: fileName, data: buffer.subarray(offset, offset + size) });
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return files;
}

function latexScore(name: string, content: string) {
  let score = 0;
  if (/\\documentclass\b/.test(content)) score += 80;
  if (/\\begin\{document\}/.test(content)) score += 80;
  if (/\\title\{/.test(content)) score += 12;
  if (/\\section\b/.test(content)) score += 8;
  if (/main|paper|article/i.test(basename(name))) score += 5;
  if (/\/(macros|defs|commands|preamble)\.tex$/i.test(name)) score -= 40;
  return score;
}

function pickMainTex(files: Array<{ name: string; data: Buffer }>) {
  const candidates = files
    .filter((file) => /\.tex$/i.test(file.name))
    .map((file) => {
      const content = file.data.toString("utf8");
      return { ...file, content, score: latexScore(file.name, content) };
    })
    .filter((file) => file.content.trim());
  candidates.sort((left, right) => right.score - left.score || left.name.length - right.name.length);
  return candidates[0] || null;
}

export function extractArxivLatexSource(buffer: Buffer, safeId: string) {
  const direct = maybeTextSource(buffer);
  if (direct) {
    return {
      latexData: Buffer.from(direct, "utf8"),
      latexFileName: `${safeId}.tex`,
      notice: "",
    };
  }

  const variants: Buffer[] = [];
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      variants.push(gunzipSync(buffer));
    } catch {
      return {
        latexData: undefined,
        latexFileName: undefined,
        notice: " arXiv source was downloaded but could not be decompressed; attach extracted .tex manually.",
      };
    }
  }
  variants.push(buffer);

  for (const variant of variants) {
    const text = maybeTextSource(variant);
    if (text) {
      return {
        latexData: Buffer.from(text, "utf8"),
        latexFileName: `${safeId}.tex`,
        notice: "",
      };
    }
    if (!isProbablyTar(variant)) continue;
    const mainTex = pickMainTex(extractTarFiles(variant));
    if (mainTex) {
      return {
        latexData: Buffer.from(mainTex.content, "utf8"),
        latexFileName: basename(mainTex.name),
        notice: ` LaTeX source imported from ${mainTex.name}.`,
      };
    }
  }

  return {
    latexData: undefined,
    latexFileName: undefined,
    notice: " arXiv source was downloaded but no main .tex file was found; attach extracted .tex manually.",
  };
}
