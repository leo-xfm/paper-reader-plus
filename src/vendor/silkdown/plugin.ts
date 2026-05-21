import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type PluginValue,
  type ViewUpdate,
} from "@codemirror/view";
import { StateEffect, StateField, type EditorSelection, type EditorState, type Extension, type Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { decorateInline } from "./decorate/inline.js";
import { decorateHeading } from "./decorate/heading.js";
import { decorateBlockquote } from "./decorate/blockquote.js";
import { decorateListItem } from "./decorate/list.js";
import {
  buildLinkReferences,
  decorateAutolink,
  decorateBareUrl,
  decorateImage,
  decorateLinkedImage,
  decorateLink,
  decorateLinkReference,
  decorateSizedMarkdownImages,
  type SilkdownLinkOptions,
} from "./decorate/link.js";
import { decorateHorizontalRule } from "./decorate/block.js";
import { decorateFencedCode } from "./decorate/fence.js";
import { decorateHighlight } from "./decorate/highlight.js";
import { decorateHtmlBlocks } from "./decorate/htmlBlock.js";
import { decorateFontColor } from "./decorate/fontColor.js";
import { decorateComplexTables } from "./decorate/complexTable.js";
import { decorateBlockMath, decorateMath } from "./decorate/math.js";
import { decorateUnderline } from "./decorate/underline.js";
import { decorateTable, decorateTablesInRange } from "./decorate/table.js";
import type { UrlPolicy } from "./url.js";

export interface SilkdownPluginOptions {
  /** Disable rendering for these node names. Useful for debugging or opt-out. */
  disable?: readonly string[];
  /**
   * URL allowlist applied to link `href` and image `src`. Defaults to
   * `defaultUrlPolicy` (http, https, data:image/\*, relative).
   */
  urlPolicy?: UrlPolicy;
  link?: SilkdownLinkOptions;
  codeLineNumbers?: boolean;
  highlightEnabled?: boolean;
  mathEnabled?: boolean;
  htmlBlockLiveEnabled?: boolean;
  liveBlockLabels?: {
    mathFormula?: string;
    emptyMathBlock?: string;
    editMathBlock?: string;
    finishEditingMathBlock?: string;
    mermaidDiagram?: string;
  };
  suppressSelectionReveal?: () => boolean;
  selectionRevealOverride?: (state: EditorState) => EditorSelection | null;
}

export type SilkdownLiveBlockLabels = Required<NonNullable<SilkdownPluginOptions["liveBlockLabels"]>>;

const defaultLiveBlockLabels: SilkdownLiveBlockLabels = {
  mathFormula: "Math formula",
  emptyMathBlock: "< Empty Math Block >",
  editMathBlock: "Edit math formula block",
  finishEditingMathBlock: "Finish editing math formula block",
  mermaidDiagram: "Mermaid diagram",
};

const INLINE_NODES = new Set(["Emphasis", "StrongEmphasis", "InlineCode", "Strikethrough"]);
const EMPTY_SELECTION = { ranges: [] } as unknown as EditorSelection;

const HEADING_NODES = new Set([
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
]);

const compositionEffect = StateEffect.define<boolean>();
const compositionField = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(compositionEffect)) return effect.value;
    }
    return value;
  },
});

export function silkdownPlugin(opts: SilkdownPluginOptions = {}): Extension {
  const disabled = new Set(opts.disable ?? []);
  const urlPolicy = opts.urlPolicy;
  const liveBlockLabels = { ...defaultLiveBlockLabels, ...opts.liveBlockLabels };
  const effectiveSelection = (state: EditorState) => {
    const override = opts.selectionRevealOverride?.(state);
    if (opts.suppressSelectionReveal?.()) return override ?? EMPTY_SELECTION;
    return override ?? state.selection;
  };
  const htmlBlockField = StateField.define<DecorationSet>({
    create(state) {
      if (disabled.has("HtmlBlock")) return Decoration.none;
      const ranges: Range<Decoration>[] = [];
      decorateComplexTables(ranges, state.doc);
      decorateHtmlBlocks(ranges, state.doc, effectiveSelection(state), opts.htmlBlockLiveEnabled !== false);
      return Decoration.set(ranges, true);
    },
    update(value, transaction) {
      if (disabled.has("HtmlBlock")) return Decoration.none;
      const composing = transaction.state.field(compositionField, false);
      const wasComposing = transaction.startState.field(compositionField, false);
      if (composing) return value.map(transaction.changes);
      if (transaction.isUserEvent("input.type.compose")) return value.map(transaction.changes);
      if (!wasComposing && !transaction.docChanged && !transaction.selection && transaction.effects.length === 0) return value.map(transaction.changes);
      const ranges: Range<Decoration>[] = [];
      decorateComplexTables(ranges, transaction.state.doc);
      decorateHtmlBlocks(ranges, transaction.state.doc, effectiveSelection(transaction.state), opts.htmlBlockLiveEnabled !== false);
      return Decoration.set(ranges, true);
    },
    provide: (field) => [
      EditorView.decorations.from(field),
      EditorView.atomicRanges.of((view) => view.state.field(field, false) ?? Decoration.none),
    ],
  });
  const tableField = StateField.define<DecorationSet>({
    create(state) {
      if (disabled.has("Table")) return Decoration.none;
      const ranges: Range<Decoration>[] = [];
      const atomicRanges: Range<Decoration>[] = [];
      const handledTableStarts = new Set<number>();
      syntaxTree(state).iterate({
        enter: (n) => {
          if (n.name !== "Table") return;
          handledTableStarts.add(n.from);
          decorateTable(ranges, atomicRanges, n.node, state.doc);
        },
      });
      decorateTablesInRange(ranges, atomicRanges, state.doc, 0, state.doc.length, handledTableStarts);
      return Decoration.set(ranges, true);
    },
    update(value, transaction) {
      if (disabled.has("Table")) return Decoration.none;
      const composing = transaction.state.field(compositionField, false);
      const wasComposing = transaction.startState.field(compositionField, false);
      if (composing) return value.map(transaction.changes);
      if (transaction.isUserEvent("input.type.compose")) return value.map(transaction.changes);
      if (!wasComposing && !transaction.docChanged) return value.map(transaction.changes);
      const ranges: Range<Decoration>[] = [];
      const atomicRanges: Range<Decoration>[] = [];
      const handledTableStarts = new Set<number>();
      syntaxTree(transaction.state).iterate({
        enter: (n) => {
          if (n.name !== "Table") return;
          handledTableStarts.add(n.from);
          decorateTable(ranges, atomicRanges, n.node, transaction.state.doc);
        },
      });
      decorateTablesInRange(ranges, atomicRanges, transaction.state.doc, 0, transaction.state.doc.length, handledTableStarts);
      return Decoration.set(ranges, true);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
  const blockMathField = StateField.define<DecorationSet>({
    create(state) {
      if (disabled.has("Math") || opts.mathEnabled === false) return Decoration.none;
      const ranges: Range<Decoration>[] = [];
      decorateBlockMath(ranges, state.doc, effectiveSelection(state), liveBlockLabels);
      return Decoration.set(ranges, true);
    },
    update(value, transaction) {
      if (disabled.has("Math") || opts.mathEnabled === false) return Decoration.none;
      const composing = transaction.state.field(compositionField, false);
      const wasComposing = transaction.startState.field(compositionField, false);
      if (composing) return value.map(transaction.changes);
      if (transaction.isUserEvent("input.type.compose")) return value.map(transaction.changes);
      if (!wasComposing && !transaction.docChanged && !transaction.selection && transaction.effects.length === 0) return value.map(transaction.changes);
      const ranges: Range<Decoration>[] = [];
      decorateBlockMath(ranges, transaction.state.doc, effectiveSelection(transaction.state), liveBlockLabels);
      return Decoration.set(ranges, true);
    },
    provide: (field) => [
      EditorView.decorations.from(field),
      EditorView.atomicRanges.of((view) => view.state.field(field, false) ?? Decoration.none),
    ],
  });

  interface BuildOutput {
    decorations: DecorationSet;
    atomicDecorations: DecorationSet;
  }

  const silkdownViewPlugin = ViewPlugin.fromClass(
    class implements PluginValue {
      decorations: DecorationSet;
      atomicDecorations: DecorationSet;

      constructor(view: EditorView) {
        const built = this.build(view);
        this.decorations = built.decorations;
        this.atomicDecorations = built.atomicDecorations;
      }

      update(u: ViewUpdate) {
        // IME guard: keep the existing rendered DOM stable while the browser
        // owns an active composition range. Rebuild after composition ends.
        const composing = u.state.field(compositionField, false) || u.view.composing;
        if (composing) {
          this.decorations = this.decorations.map(u.changes);
          this.atomicDecorations = this.atomicDecorations.map(u.changes);
          return;
        }

        if (
          u.docChanged ||
          u.viewportChanged ||
          u.selectionSet ||
          u.transactions.some((transaction) => transaction.effects.length > 0) ||
          syntaxTree(u.startState) !== syntaxTree(u.state)
        ) {
          const built = this.build(u.view);
          this.decorations = built.decorations;
          this.atomicDecorations = built.atomicDecorations;
        }
      }

      build(view: EditorView): BuildOutput {
        const ranges: Range<Decoration>[] = [];
        const atomicRanges: Range<Decoration>[] = [];
        const tree = syntaxTree(view.state);
        const sel = effectiveSelection(view.state);
        const doc = view.state.doc;
        const references = buildLinkReferences(tree, doc);
        const codeLineNumbers = opts.codeLineNumbers !== false;
        const highlightEnabled = opts.highlightEnabled !== false;
        const mathEnabled = opts.mathEnabled !== false;

        for (const { from, to } of view.visibleRanges) {
          if (mathEnabled && !disabled.has("Math")) {
            decorateMath(ranges, atomicRanges, doc, sel, from, to, liveBlockLabels);
          }
          if (highlightEnabled && !disabled.has("Highlight")) {
            decorateHighlight(ranges, atomicRanges, doc, sel, from, to);
          }
          if (!disabled.has("Image")) {
            decorateSizedMarkdownImages(ranges, atomicRanges, doc, sel, from, to, urlPolicy, opts.link);
          }
          if (!disabled.has("Underline")) {
            decorateUnderline(ranges, atomicRanges, doc, sel, from, to);
          }
          if (!disabled.has("FontColor")) {
            decorateFontColor(ranges, atomicRanges, doc, sel, from, to);
          }
          tree.iterate({
            from,
            to,
            enter: (n) => {
              if (disabled.has(n.name)) return false;

              if (HEADING_NODES.has(n.name)) {
                decorateHeading(ranges, atomicRanges, n.node, doc, sel);
                // Descend so inline marks inside headings (e.g. ### **Title**) render too.
              }

              if (INLINE_NODES.has(n.name)) {
                decorateInline(ranges, atomicRanges, n.node, doc, sel);
                // Descend so combined marks (e.g. *** = Emphasis > StrongEmphasis)
                // get nested decoration from each level.
              }

              if (n.name === "Blockquote") {
                decorateBlockquote(ranges, atomicRanges, n.node, doc, sel);
              }

              if (n.name === "Table") {
                return false;
              }

              if (n.name === "ListItem") {
                decorateListItem(ranges, atomicRanges, n.node, doc, sel);
              }

              if (n.name === "Link") {
                if (decorateLinkedImage(ranges, atomicRanges, n.node, doc, sel, references, urlPolicy, opts.link)) {
                  return false;
                }
                decorateLink(ranges, atomicRanges, n.node, doc, sel, references, urlPolicy);
                return false;
              }

              if (n.name === "Image") {
                decorateImage(ranges, atomicRanges, n.node, doc, sel, references, urlPolicy, opts.link);
                return false;
              }

              if (n.name === "Autolink") {
                decorateAutolink(ranges, atomicRanges, n.node, doc, sel, urlPolicy);
                return false;
              }

              if (n.name === "URL") {
                // Reaching a URL node here means it's a bare GFM autolink in
                // prose. URLs inside Link/Image/Autolink/LinkReference never
                // arrive because those parents return false.
                decorateBareUrl(ranges, n.node, doc, urlPolicy);
                return false;
              }

              if (n.name === "LinkReference") {
                decorateLinkReference(ranges, atomicRanges, n.node, doc, sel);
                return false;
              }

              if (n.name === "HorizontalRule") {
                decorateHorizontalRule(ranges, atomicRanges, n.node, doc, sel);
                return false;
              }

              if (n.name === "FencedCode") {
                decorateFencedCode(ranges, atomicRanges, n.node, doc, sel, codeLineNumbers, liveBlockLabels);
                // Descend so lang-markdown's highlight tags still apply.
              }
            },
          });
        }

        return {
          decorations: Decoration.set(ranges, true),
          atomicDecorations: Decoration.set(atomicRanges, true),
        };
      }
    },
    {
      eventHandlers: {
        compositionstart(_event, view) {
          view.dispatch({ effects: compositionEffect.of(true) });
          return false;
        },
        compositionend(_event, view) {
          window.setTimeout(() => {
            if (!view.composing) view.dispatch({ effects: compositionEffect.of(false) });
          }, 0);
          return false;
        },
      },
      provide: (p) => [
        EditorView.decorations.of((view) => view.plugin(p)?.decorations ?? Decoration.none),
        EditorView.atomicRanges.of((view) => view.plugin(p)?.atomicDecorations ?? Decoration.none),
      ],
    },
  );
  return [compositionField, htmlBlockField, tableField, blockMathField, silkdownViewPlugin];
}
