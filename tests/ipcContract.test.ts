import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function unique(values: Iterable<string>) {
  return [...new Set(values)].sort();
}

function readFilesRecursively(dir: string, extensions: string[]): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return readFilesRecursively(relativePath, extensions);
    return extensions.some((extension) => entry.name.endsWith(extension)) ? [read(relativePath)] : [];
  });
}

function envApiNames(env: string) {
  return unique([...env.matchAll(/^ {6}([a-zA-Z0-9_]+)\(/gm)].map((match) => match[1]));
}

function preloadApiNames(preload: string) {
  const exposedObject = preload.slice(preload.indexOf('contextBridge.exposeInMainWorld("paperReaderPlus", {'));
  return unique([...exposedObject.matchAll(/^ {2}([a-zA-Z0-9_]+):/gm)].map((match) => match[1]));
}

describe("IPC contract", () => {
  it("keeps preload invoke channels registered in Electron IPC", () => {
    const preload = read("electron/preload.ts");
    const ipcSources = [
      read("electron/main.ts"),
      ...readFilesRecursively("electron/ipc", [".ts"]),
      ...readFilesRecursively("electron/services", [".ts"]),
    ].join("\n");
    const preloadChannels = unique([...preload.matchAll(/ipcRenderer\.invoke\("([^"]+)"/g)].map((match) => match[1]));
    const registeredChannels = unique([...ipcSources.matchAll(/ipcMain\.handle\("([^"]+)"/g)].map((match) => match[1]));
    expect(preloadChannels).toEqual(registeredChannels);
  });

  it("keeps preload API names aligned with renderer type declarations", () => {
    const preload = read("electron/preload.ts");
    const env = read("src/env.d.ts");
    const preloadApis = preloadApiNames(preload);
    const envApis = envApiNames(env);
    expect(preloadApis).toEqual(envApis);
  });

  it("keeps renderer paperReaderPlus usage declared", () => {
    const rendererSources = readFilesRecursively("src", [".ts", ".vue"]).join("\n");
    const env = read("src/env.d.ts");
    const usedApis = unique([...rendererSources.matchAll(/window\.paperReaderPlus\.([a-zA-Z0-9_]+)/g)].map((match) => match[1]));
    const envApis = envApiNames(env);
    expect(usedApis.filter((api) => !envApis.includes(api))).toEqual([]);
  });
});
