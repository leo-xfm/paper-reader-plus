import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { extname } from "node:path";
import { app } from "electron";

const ASSOCIATIONS = [
  { extension: ".readerp", progId: "PaperReaderPlus.ReaderP", description: "Paper Reader Plus ReaderP Package" },
  { extension: ".readerm", progId: "PaperReaderPlus.ReaderM", description: "Paper Reader Plus ReaderM Package" },
] as const;

export type FileAssociationStatus = {
  platform: NodeJS.Platform;
  supported: boolean;
  associated: boolean;
  associations: Array<{
    extension: ".readerp" | ".readerm";
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

function currentWindowsAssociations() {
  const script = `
$ErrorActionPreference = "Stop"
$extensions = @(".readerp", ".readerm")
$result = @{}
foreach ($extension in $extensions) {
  $choicePath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\$extension\\UserChoice"
  $classesPath = "HKCU:\\Software\\Classes\\$extension"
  $progId = $null
  if (Test-Path $choicePath) {
    $progId = (Get-ItemProperty -Path $choicePath -Name ProgId -ErrorAction SilentlyContinue).ProgId
  }
  if (-not $progId -and (Test-Path $classesPath)) {
    $progId = (Get-ItemProperty -Path $classesPath -Name "(default)" -ErrorAction SilentlyContinue)."(default)"
  }
  $result[$extension] = [bool]($progId -like "PaperReaderPlus.*")
}
$result | ConvertTo-Json -Compress
`;
  const raw = runPowerShell(script);
  const parsed = JSON.parse(raw || "{}") as Record<string, boolean>;
  return ASSOCIATIONS.map((item) => ({
    extension: item.extension,
    associated: Boolean(parsed[item.extension]),
  }));
}

export function getFileAssociationStatus(): FileAssociationStatus {
  if (process.platform !== "win32") {
    return {
      platform: process.platform,
      supported: false,
      associated: false,
      associations: ASSOCIATIONS.map((item) => ({ extension: item.extension, associated: false })),
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

export function registerFileAssociations() {
  if (process.platform !== "win32") {
    throw new Error("File association setup is only supported on Windows.");
  }
  const exePath = executablePath();
  if (!existsSync(exePath)) throw new Error("Application executable was not found.");
  const escapedExePath = escapeRegString(exePath);
  const appName = escapeRegString(app.getName() || "Paper Reader Plus");
  const entries = ASSOCIATIONS.map((item) => {
    const extension = escapeRegString(item.extension);
    const progId = escapeRegString(item.progId);
    const description = escapeRegString(item.description);
    return `
New-Item -Path "HKCU:\\Software\\Classes\\${extension}" -Force | Out-Null
New-ItemProperty -Path "HKCU:\\Software\\Classes\\${extension}" -Name "(default)" -Value "${progId}" -PropertyType String -Force | Out-Null
New-Item -Path "HKCU:\\Software\\Classes\\${progId}" -Force | Out-Null
New-ItemProperty -Path "HKCU:\\Software\\Classes\\${progId}" -Name "(default)" -Value "${description}" -PropertyType String -Force | Out-Null
New-Item -Path "HKCU:\\Software\\Classes\\${progId}\\DefaultIcon" -Force | Out-Null
New-ItemProperty -Path "HKCU:\\Software\\Classes\\${progId}\\DefaultIcon" -Name "(default)" -Value '"${escapedExePath}",0' -PropertyType String -Force | Out-Null
New-Item -Path "HKCU:\\Software\\Classes\\${progId}\\shell\\open\\command" -Force | Out-Null
New-ItemProperty -Path "HKCU:\\Software\\Classes\\${progId}\\shell\\open\\command" -Name "(default)" -Value '"${escapedExePath}" "%1"' -PropertyType String -Force | Out-Null
New-Item -Path "HKCU:\\Software\\RegisteredApplications" -Force | Out-Null
New-ItemProperty -Path "HKCU:\\Software\\RegisteredApplications" -Name "${appName}" -Value "Software\\Clients\\StartMenuInternet\\${appName}\\Capabilities" -PropertyType String -Force | Out-Null
`;
  }).join("\n");
  runPowerShell(`
$ErrorActionPreference = "Stop"
${entries}
$signature = @'
[DllImport("shell32.dll")] public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
'@
$shell = Add-Type -MemberDefinition $signature -Name ShellNotify -Namespace Win32 -PassThru
$shell::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
`);
  return getFileAssociationStatus();
}

export function fileAssociationArg(argv: string[]) {
  return argv.find((arg) => {
    const extension = extname(arg).toLowerCase();
    return extension === ".readerp" || extension === ".readerm";
  }) || "";
}
