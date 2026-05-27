import {
  Bot,
  FileText,
  Highlighter,
  Radical,
  Sigma,
  StickyNote,
  type LucideIcon,
} from "lucide-vue-next";
import type { I18nKey } from "@/i18n";

export type RightPanelTab = "annotations" | "notes" | "summary" | "ai" | "symbols" | "formulas";

export const readerPanelTabs = [
  { key: "annotations", titleKey: "panel.tab.annotations", icon: Highlighter },
  { key: "notes", titleKey: "panel.tab.notes", icon: StickyNote },
  { key: "summary", titleKey: "panel.tab.summary", icon: FileText },
  { key: "symbols", titleKey: "panel.tab.symbols", icon: Sigma },
  { key: "formulas", titleKey: "panel.tab.formulas", icon: Radical },
  { key: "ai", titleKey: "panel.tab.ai", icon: Bot },
] satisfies Array<{ key: RightPanelTab; titleKey: I18nKey; icon: LucideIcon }>;
