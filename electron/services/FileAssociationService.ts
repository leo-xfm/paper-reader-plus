import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { extname } from "node:path";
import { app } from "electron";

const ASSOCIATIONS = [
  { extension: ".readerp", progId: "PaperReaderPlus.ReaderP", description: "Paper Reader Plus ReaderP Package" },
  { extension: ".readerm", progId: "PaperReaderPlus.ReaderM", description: "Paper Reader Plus ReaderM Package" },
  { extension: ".md", progId: "PaperReaderPlus.Markdown", description: "Paper Reader Plus Markdown Document" },
] as const;

export type FileAssociationExtension = typeof ASSOCIATIONS[number]["extension"];

export type FileAssociationStatus = {
  platform: NodeJS.Platform;
  supported: boolean;
  associated: boolean;
  associations: Array<{
    extension: FileAssociationExtension;
    registered: boolean;
    associated: boolean;
  }>;
};

function executablePath() {
  return process.execPath;
}

function escapeRegString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function runPowerShell(script: string) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || "Unknown registry error.";
    throw new Error(detail);
  }
  return result.stdout.trim();
}

type WindowsAssociationRegistryEntry = {
  extensionDefault?: string;
  userChoiceProgId?: string;
  command?: string;
};

export function parseWindowsAssociationStatus(entries: Record<string, WindowsAssociationRegistryEntry>, exePath: string) {
  const expectedCommand = `"${exePath}" "%1"`.toLowerCase();
  return ASSOCIATIONS.map((item) => {
    const entry = entries[item.extension] || {};
    const registered = entry.extensionDefault === item.progId && entry.command?.toLowerCase() === expectedCommand;
    const associated = entry.userChoiceProgId
      ? entry.userChoiceProgId === item.progId
      : registered;
    return {
      extension: item.extension,
      registered,
      associated,
    };
  });
}

function currentWindowsAssociations() {
  const exePath = executablePath();
  const script = `
$ErrorActionPreference = "Stop"
$items = @(
  @{ Extension = ".readerp"; ProgId = "PaperReaderPlus.ReaderP" },
  @{ Extension = ".readerm"; ProgId = "PaperReaderPlus.ReaderM" },
  @{ Extension = ".md"; ProgId = "PaperReaderPlus.Markdown" }
)
$result = [ordered]@{}
foreach ($item in $items) {
  $extension = $item.Extension
  $progId = $item.ProgId
  $choicePath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\$extension\\UserChoice"
  $classesPath = "HKCU:\\Software\\Classes\\$extension"
  $progIdPath = "HKCU:\\Software\\Classes\\$progId\\shell\\open\\command"
  $userChoiceProgId = $null
  $extensionDefault = $null
  $command = $null
  if (Test-Path $choicePath) {
    $userChoiceProgId = (Get-ItemProperty -Path $choicePath -Name ProgId -ErrorAction SilentlyContinue).ProgId
  }
  if (Test-Path $classesPath) {
    $extensionDefault = (Get-Item -Path $classesPath).GetValue("")
  }
  if (Test-Path $progIdPath) {
    $command = (Get-Item -Path $progIdPath).GetValue("")
  }
  $result[$extension] = @{
    extensionDefault = $extensionDefault
    userChoiceProgId = $userChoiceProgId
    command = $command
  }
}
$result | ConvertTo-Json -Compress
`;
  const raw = runPowerShell(script);
  const parsed = JSON.parse(raw || "{}") as Record<string, WindowsAssociationRegistryEntry>;
  return parseWindowsAssociationStatus(parsed, exePath);
}

function associationForExtension(extension: string) {
  const normalized = extension.toLowerCase();
  const association = ASSOCIATIONS.find((item) => item.extension === normalized);
  if (!association) throw new Error(`Unsupported file extension: ${extension}`);
  return association;
}

export function getFileAssociationStatus(): FileAssociationStatus {
  if (process.platform !== "win32") {
    return {
      platform: process.platform,
      supported: false,
      associated: false,
      associations: ASSOCIATIONS.map((item) => ({ extension: item.extension, registered: false, associated: false })),
    };
  }
  const associations = currentWindowsAssociations();
  return {
    platform: process.platform,
    supported: true,
    associated: associations.every((item) => item.associated),
    associations,
  };
}

function notifyShellAssociationChanged() {
  runPowerShell(`
$ErrorActionPreference = "Stop"
$signature = @'
[DllImport("shell32.dll")] public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
'@
$shell = Add-Type -MemberDefinition $signature -Name ShellNotify -Namespace Win32 -PassThru
$shell::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
`);
}

export function registerFileAssociation(extension: FileAssociationExtension) {
  if (process.platform !== "win32") {
    throw new Error("File association setup is only supported on Windows.");
  }
  const exePath = executablePath();
  if (!existsSync(exePath)) throw new Error("Application executable was not found.");
  const item = associationForExtension(extension);
  const escapedExePath = escapeRegString(exePath);
  const appName = escapeRegString(app.getName() || "Paper Reader Plus");
  const escapedExtension = escapeRegString(item.extension);
  const progId = escapeRegString(item.progId);
  const description = escapeRegString(item.description);
  runPowerShell(`
$ErrorActionPreference = "Stop"
New-Item -Path "HKCU:\\Software\\Classes\\${escapedExtension}" -Force | Out-Null
New-ItemProperty -Path "HKCU:\\Software\\Classes\\${escapedExtension}" -Name "(default)" -Value "${progId}" -PropertyType String -Force | Out-Null
New-Item -Path "HKCU:\\Software\\Classes\\${progId}" -Force | Out-Null
New-ItemProperty -Path "HKCU:\\Software\\Classes\\${progId}" -Name "(default)" -Value "${description}" -PropertyType String -Force | Out-Null
New-Item -Path "HKCU:\\Software\\Classes\\${progId}\\DefaultIcon" -Force | Out-Null
New-ItemProperty -Path "HKCU:\\Software\\Classes\\${progId}\\DefaultIcon" -Name "(default)" -Value '"${escapedExePath}",0' -PropertyType String -Force | Out-Null
New-Item -Path "HKCU:\\Software\\Classes\\${progId}\\shell\\open\\command" -Force | Out-Null
New-ItemProperty -Path "HKCU:\\Software\\Classes\\${progId}\\shell\\open\\command" -Name "(default)" -Value '"${escapedExePath}" "%1"' -PropertyType String -Force | Out-Null
New-Item -Path "HKCU:\\Software\\RegisteredApplications" -Force | Out-Null
New-ItemProperty -Path "HKCU:\\Software\\RegisteredApplications" -Name "${appName}" -Value "Software\\Clients\\StartMenuInternet\\${appName}\\Capabilities" -PropertyType String -Force | Out-Null
`);
  notifyShellAssociationChanged();
  return getFileAssociationStatus();
}

export function unregisterFileAssociation(extension: FileAssociationExtension) {
  if (process.platform !== "win32") {
    throw new Error("File association setup is only supported on Windows.");
  }
  const item = associationForExtension(extension);
  const escapedExtension = escapeRegString(item.extension);
  const progId = escapeRegString(item.progId);
  runPowerShell(`
$ErrorActionPreference = "Stop"
$classesPath = "HKCU:\\Software\\Classes\\${escapedExtension}"
$progIdPath = "HKCU:\\Software\\Classes\\${progId}"
$choicePath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\${escapedExtension}\\UserChoice"
if (Test-Path $classesPath) {
  $currentProgId = (Get-ItemProperty -Path $classesPath -Name "(default)" -ErrorAction SilentlyContinue)."(default)"
  if ($currentProgId -eq "${progId}") {
    Remove-Item -Path $classesPath -Recurse -Force
  }
}
if (Test-Path $progIdPath) {
  Remove-Item -Path $progIdPath -Recurse -Force
}
if (Test-Path $choicePath) {
  $choiceProgId = (Get-ItemProperty -Path $choicePath -Name ProgId -ErrorAction SilentlyContinue).ProgId
  if ($choiceProgId -eq "${progId}") {
    Remove-Item -Path $choicePath -Recurse -Force -ErrorAction SilentlyContinue
  }
}
`);
  notifyShellAssociationChanged();
  return getFileAssociationStatus();
}

export function registerFileAssociations() {
  for (const item of ASSOCIATIONS) registerFileAssociation(item.extension);
  return getFileAssociationStatus();
}

export function fileAssociationArg(argv: string[]) {
  return argv.find((arg) => {
    const extension = extname(arg).toLowerCase();
    return extension === ".readerp" || extension === ".readerm" || extension === ".md";
  }) || "";
}
