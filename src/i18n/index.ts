import { computed, ref, type ComputedRef } from "vue";
import { messages, type I18nKey, type ResolvedUiLanguage, type UiLanguage } from "./messages";

export type { I18nKey, ResolvedUiLanguage, UiLanguage };

const currentLanguage = ref<UiLanguage>("system");

export function resolveUiLanguage(language: UiLanguage | undefined, systemLanguage?: string): ResolvedUiLanguage {
  const selected = language || "system";
  if (selected === "zh-CN" || selected === "en-US") return selected;
  const source = (systemLanguage || (typeof navigator !== "undefined" ? navigator.language : "")).toLowerCase();
  return source.startsWith("zh") ? "zh-CN" : "en-US";
}

export function translate(language: UiLanguage | undefined, key: I18nKey, params: Record<string, string | number> = {}, systemLanguage?: string) {
  const resolved = resolveUiLanguage(language, systemLanguage);
  const template = messages[resolved][key] || messages["en-US"][key] || key;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ""));
}

export function setUiLanguage(language: UiLanguage | undefined) {
  currentLanguage.value = language || "system";
}

export function useI18n(): {
  language: ComputedRef<ResolvedUiLanguage>;
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
} {
  const language = computed(() => resolveUiLanguage(currentLanguage.value));
  return {
    language,
    t: (key, params) => translate(currentLanguage.value, key, params),
  };
}

