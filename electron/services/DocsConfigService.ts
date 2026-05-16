import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

export type DocsKeyConfig = {
  translation?: Array<Record<string, unknown>>;
  agent?: Array<Record<string, unknown>>;
};

export type TemplateName = "system" | "literature-read" | "literature-translate" | "literature-metaphor";

const TEMPLATE_FILES: Record<TemplateName, string> = {
  system: "system.j2",
  "literature-read": "literature-read.j2",
  "literature-translate": "literature-translate.j2",
  "literature-metaphor": "literature-metaphor.j2",
};

function candidateDocsDirs() {
  const appPath = app?.getAppPath?.() || process.cwd();
  const packagedResourcesDocs = app?.isPackaged ? join(process.resourcesPath, "docs") : "";
  return [
    packagedResourcesDocs,
    join(appPath, "docs"),
    join(process.cwd(), "docs"),
    join(appPath, "..", "docs"),
  ].filter(Boolean);
}

export function resolveDocsPath(fileName: string) {
  for (const dir of candidateDocsDirs()) {
    const target = join(dir, fileName);
    if (existsSync(target)) return target;
  }
  return join(process.cwd(), "docs", fileName);
}

export function readTemplate(name: TemplateName) {
  return readFileSync(resolveDocsPath(TEMPLATE_FILES[name]), "utf8");
}

export function listTemplateStatus() {
  return Object.entries(TEMPLATE_FILES).map(([name, fileName]) => {
    const path = resolveDocsPath(fileName);
    return {
      name,
      fileName,
      path,
      available: existsSync(path),
      content: existsSync(path) ? readFileSync(path, "utf8") : "",
    };
  });
}

export function readDocsKeyConfig(): DocsKeyConfig {
  const path = resolveDocsPath("key.local.json");
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DocsKeyConfig;
  } catch {
    return {};
  }
}

export function findDocsService(config: DocsKeyConfig, group: "translation" | "agent", servicePattern: RegExp) {
  return (config[group] || []).find((entry) => servicePattern.test(String(entry.service || ""))) || {};
}
