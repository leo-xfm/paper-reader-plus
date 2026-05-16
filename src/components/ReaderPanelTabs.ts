import {
  Bot,
  FileText,
  Highlighter,
  Sigma,
  StickyNote,
  type LucideIcon,
} from "lucide-vue-next";
import type { I18nKey } from "@/i18n";

export type RightPanelTab = "annotations" | "notes" | "summary" | "ai" | "symbols";

export const readerPanelTabs = [
  { key: "annotations", titleKey: "panel.tab.annotations", icon: Highlighter },
  { key: "notes", titleKey: "panel.tab.notes", icon: StickyNote },
  { key: "summary", titleKey: "panel.tab.summary", icon: FileText },
  { key: "symbols", titleKey: "panel.tab.symbols", icon: Sigma },
  { key: "ai", titleKey: "panel.tab.ai", icon: Bot },
] satisfies Array<{ key: RightPanelTab; titleKey: I18nKey; icon: LucideIcon }>;
