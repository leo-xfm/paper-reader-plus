export type MarkdownFontOption = {
  value: string;
  label: string;
  style: { fontFamily: string };
};

export const markdownFontOptions: MarkdownFontOption[] = [
  { value: "Aptos", label: "Aptos", style: { fontFamily: '"Aptos", system-ui, sans-serif' } },
  { value: "Arial", label: "Arial", style: { fontFamily: '"Arial", system-ui, sans-serif' } },
  { value: "Cambria", label: "Cambria", style: { fontFamily: '"Cambria", Georgia, serif' } },
  { value: "Georgia", label: "Georgia", style: { fontFamily: '"Georgia", serif' } },
  { value: "current", label: "Inter", style: { fontFamily: '"Inter", system-ui, sans-serif' } },
  { value: "Segoe UI", label: "Segoe UI", style: { fontFamily: '"Segoe UI", system-ui, sans-serif' } },
  { value: "Times New Roman", label: "Times New Roman", style: { fontFamily: '"Times New Roman", Georgia, serif' } },
];

export const markdownCodeFontOptions: MarkdownFontOption[] = [
  { value: "Anonymous Pro", label: "Anonymous Pro", style: { fontFamily: '"Anonymous Pro", Consolas, monospace' } },
  { value: "Consolas", label: "Consolas", style: { fontFamily: '"Consolas", monospace' } },
  { value: "DejaVu Sans Mono", label: "DejaVu Sans Mono", style: { fontFamily: '"DejaVu Sans Mono", Consolas, monospace' } },
  { value: "Menlo", label: "Menlo", style: { fontFamily: '"Menlo", Consolas, monospace' } },
  { value: "Monaco", label: "Monaco", style: { fontFamily: '"Monaco", Consolas, monospace' } },
  { value: "Monaspace Argon", label: "Monaspace Argon", style: { fontFamily: '"Monaspace Argon", Consolas, monospace' } },
  { value: "Monaspace Krypton", label: "Monaspace Krypton", style: { fontFamily: '"Monaspace Krypton", Consolas, monospace' } },
  { value: "Monaspace Neon", label: "Monaspace Neon", style: { fontFamily: '"Monaspace Neon", Consolas, monospace' } },
  { value: "Monaspace Radon", label: "Monaspace Radon", style: { fontFamily: '"Monaspace Radon", Consolas, monospace' } },
  { value: "Monaspace Xenon", label: "Monaspace Xenon", style: { fontFamily: '"Monaspace Xenon", Consolas, monospace' } },
  { value: "Source Code Pro", label: "Source Code Pro", style: { fontFamily: '"Source Code Pro", Consolas, monospace' } },
  { value: "Space Mono", label: "Space Mono", style: { fontFamily: '"Space Mono", Consolas, monospace' } },
];

export function markdownBodyFontFamily(value = "current") {
  if (value === "current") return "inherit";
  if (value === "Aptos" || value === "Arial" || value === "Segoe UI") return `"${value}", system-ui, sans-serif`;
  return `"${value}", Georgia, "Times New Roman", serif`;
}

export function markdownCodeFontFamily(value = "Consolas") {
  return `"${value}", Consolas, "SFMono-Regular", "Liberation Mono", Menlo, monospace`;
}
