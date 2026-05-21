export type MarkdownFontOption = {
  value: string;
  label: string;
  style: { fontFamily: string };
};

export const markdownWesternFontOptions: MarkdownFontOption[] = [
  { value: "Aptos", label: "Aptos", style: { fontFamily: '"Aptos", system-ui, sans-serif' } },
  { value: "Arial", label: "Arial", style: { fontFamily: '"Arial", system-ui, sans-serif' } },
  { value: "Cambria", label: "Cambria", style: { fontFamily: '"Cambria", Georgia, serif' } },
  { value: "Georgia", label: "Georgia", style: { fontFamily: '"Georgia", serif' } },
  { value: "current", label: "Inter", style: { fontFamily: '"Inter", system-ui, sans-serif' } },
  { value: "Segoe UI", label: "Segoe UI", style: { fontFamily: '"Segoe UI", system-ui, sans-serif' } },
  { value: "Times New Roman", label: "Times New Roman", style: { fontFamily: '"Times New Roman", Georgia, serif' } },
];

export const markdownChineseFontOptions: MarkdownFontOption[] = [
  { value: "仿宋", label: "仿宋", style: { fontFamily: '"FangSong", "FangSong_GB2312", "STFangsong", serif' } },
  { value: "宋体", label: "宋体", style: { fontFamily: '"SimSun", "Songti SC", "Noto Serif CJK SC", serif' } },
  { value: "黑体", label: "黑体", style: { fontFamily: '"SimHei", "Heiti SC", "Noto Sans CJK SC", sans-serif' } },
  { value: "楷体", label: "楷体", style: { fontFamily: '"KaiTi", "Kaiti SC", "STKaiti", serif' } },
  { value: "思源宋体", label: "思源宋体", style: { fontFamily: '"Source Han Serif SC", "Noto Serif CJK SC", "SimSun", serif' } },
  { value: "微软雅黑", label: "微软雅黑", style: { fontFamily: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif' } },
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

const westernSansFonts = new Set(["Aptos", "Arial", "Segoe UI"]);
const chineseFontStacks: Record<string, string[]> = {
  current: ['"Microsoft YaHei"', '"PingFang SC"', '"Noto Sans CJK SC"'],
  仿宋: ['"FangSong"', '"FangSong_GB2312"', '"STFangsong"'],
  宋体: ['"SimSun"', '"Songti SC"', '"Noto Serif CJK SC"'],
  黑体: ['"SimHei"', '"Heiti SC"', '"Noto Sans CJK SC"'],
  楷体: ['"KaiTi"', '"Kaiti SC"', '"STKaiti"'],
  思源宋体: ['"Source Han Serif SC"', '"Noto Serif CJK SC"', '"SimSun"'],
  微软雅黑: ['"Microsoft YaHei"', '"PingFang SC"', '"Noto Sans CJK SC"'],
};

export const markdownFontOptions = markdownWesternFontOptions;

export function markdownBodyFontFamily(westernValue = "current", chineseValue = "current") {
  const westernStack = westernValue === "current" ? ["inherit"] : [`"${westernValue}"`];
  const chineseStack = chineseFontStacks[chineseValue] || chineseFontStacks.current;
  const fallbackStack = westernValue === "current" || westernSansFonts.has(westernValue)
    ? ["system-ui", "sans-serif"]
    : ["Georgia", '"Times New Roman"', "serif"];
  return [...westernStack, ...chineseStack, ...fallbackStack].join(", ");
}

export function markdownCodeFontFamily(value = "Consolas") {
  return `"${value}", Consolas, "SFMono-Regular", "Liberation Mono", Menlo, monospace`;
}
