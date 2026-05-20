import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { silkdownPlugin, type SilkdownPluginOptions } from "./plugin.js";
import { markdownKeymap } from "./shortcuts.js";
import { baseTheme } from "./theme.js";
import { linkClickHandler } from "./decorate/link.js";

export interface SilkdownOptions extends SilkdownPluginOptions {
  /**
   * Provide highlighters for fenced code blocks. Defaults to the full
   * `@codemirror/language-data` array (lazy-loaded by Lezer).
   */
  codeLanguages?: typeof languages;
}

export function silkdown(opts: SilkdownOptions = {}): Extension {
  const { codeLanguages = languages, ...pluginOpts } = opts;
  return [
    markdown({
      base: markdownLanguage,
      codeLanguages,
      addKeymap: false,
    }),
    silkdownPlugin(pluginOpts),
    history(),
    keymap.of(historyKeymap),
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(true),
    linkClickHandler,
    markdownKeymap,
    baseTheme,
  ];
}

export { silkdownPlugin } from "./plugin.js";
export type { SilkdownPluginOptions } from "./plugin.js";
export { markdownKeymap } from "./shortcuts.js";
export { baseTheme } from "./theme.js";
export { defaultUrlPolicy, safeUrl } from "./url.js";
export type { UrlPolicy } from "./url.js";
