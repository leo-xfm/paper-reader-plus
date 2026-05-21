<script setup lang="ts">
import UiDropdown from "@/components/UiDropdown.vue";
import { useI18n } from "@/i18n";
import { markdownChineseFontOptions, markdownCodeFontOptions, markdownWesternFontOptions } from "@/services/MarkdownFontOptionsService";
import type { FileAssociationExtension, FileAssociationStatus, PromptTemplateStatus, Settings } from "@/types";

export type SettingsPanel = "general" | "markdown" | "agent-api" | "ocr-api" | "translation-api" | "file-associations" | "system-prompt" | "summary-prompt";

defineProps<{
  panel: SettingsPanel;
  settings: Settings;
  promptTemplatePreview: Array<PromptTemplateStatus & { preview: string }>;
  testing: "agent" | "translation" | "simpletex" | null;
  fileAssociationStatus: FileAssociationStatus | null;
  fileAssociationBusy: FileAssociationExtension | "all" | null;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "save"): void;
  (event: "testAgent"): void;
  (event: "testTranslation"): void;
  (event: "testSimpleTexOcr"): void;
  (event: "registerFileAssociations"): void;
  (event: "updateFileAssociation", extension: FileAssociationExtension, associated: boolean): void;
}>();

function fileAssociationStateLabel(item: FileAssociationStatus["associations"][number]) {
  if (item.associated) return t("settings.fileAssociationBound");
  if (item.registered) return t("settings.fileAssociationRegisteredOnly");
  return t("settings.fileAssociationUnbound");
}
</script>

<template>
  <div class="modal-backdrop">
    <section v-if="panel === 'general'" class="modal settings-modal">
      <header class="settings-modal-header">
        <h2>{{ t("settings.general") }}</h2>
        <p class="modal-meta">{{ t("settings.generalDescription") }}</p>
      </header>
      <div class="settings-general-list">
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.interfaceLanguage") }}</span>
          <small>{{ t("settings.interfaceLanguageDescription") }}</small>
          <UiDropdown
            v-model="settings.ui_language"
            :title="t('settings.interfaceLanguage')"
            :options="[
              { value: 'system', label: t('settings.language.system') },
              { value: 'en-US', label: t('settings.language.english') },
              { value: 'zh-CN', label: t('settings.language.chinese') },
            ]"
          />
        </label>
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.captureImageScale") }}</span>
          <small>{{ t("settings.captureImageScaleDescription") }}</small>
          <input v-model.number="settings.capture_image_scale" type="number" min="1" max="6" step="0.5" />
        </label>
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.networkProxy") }}</span>
          <small>{{ t("settings.networkProxyDescription") }}</small>
          <span class="settings-checkbox">
            <input v-model="settings.network_proxy_enabled" type="checkbox" />
            <span>{{ t("settings.enableProxy") }}</span>
          </span>
        </label>
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.proxyUrl") }}</span>
          <small>{{ t("settings.proxyUrlDescription") }}</small>
          <input v-model="settings.network_proxy_url" placeholder="http://127.0.0.1:8888" />
        </label>
      </div>
      <div class="modal-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="button" class="primary" @click="emit('save')">{{ t("common.save") }}</button>
      </div>
    </section>

    <section v-else-if="panel === 'markdown'" class="modal settings-modal">
      <header class="settings-modal-header">
        <h2>{{ t("settings.markdown") }}</h2>
        <p class="modal-meta">{{ t("settings.markdownDescription") }}</p>
      </header>
      <div class="settings-general-list">
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.markdownDefaultFontSize") }}</span>
          <small>{{ t("settings.markdownDefaultFontSizeDescription") }}</small>
          <input v-model.number="settings.markdown_default_font_size" type="number" min="11" max="28" step="1" />
        </label>
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.markdownLineHeight") }}</span>
          <small>{{ t("settings.markdownLineHeightDescription") }}</small>
          <input v-model.number="settings.markdown_line_height" type="number" min="1.1" max="2.2" step="0.05" />
        </label>
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.markdownCodeFontScale") }}</span>
          <small>{{ t("settings.markdownCodeFontScaleDescription") }}</small>
          <input v-model.number="settings.markdown_code_font_scale" type="number" min="0.7" max="1.1" step="0.01" />
        </label>
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.markdownCodeLineHeight") }}</span>
          <small>{{ t("settings.markdownCodeLineHeightDescription") }}</small>
          <input v-model.number="settings.markdown_code_line_height" type="number" min="1" max="1.8" step="0.02" />
        </label>
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.markdownWesternFontFamily") }}</span>
          <small>{{ t("settings.markdownWesternFontFamilyDescription") }}</small>
          <UiDropdown
            v-model="settings.markdown_western_font_family"
            :title="t('settings.markdownWesternFontFamily')"
            :options="markdownWesternFontOptions"
          />
        </label>
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.markdownChineseFontFamily") }}</span>
          <small>{{ t("settings.markdownChineseFontFamilyDescription") }}</small>
          <UiDropdown
            v-model="settings.markdown_chinese_font_family"
            :title="t('settings.markdownChineseFontFamily')"
            :options="markdownChineseFontOptions"
          />
        </label>
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.markdownCodeFontFamily") }}</span>
          <small>{{ t("settings.markdownCodeFontFamilyDescription") }}</small>
          <UiDropdown
            v-model="settings.markdown_code_font_family"
            :title="t('settings.markdownCodeFontFamily')"
            :options="markdownCodeFontOptions"
          />
        </label>
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.markdownDefaultEditorMode") }}</span>
          <small>{{ t("settings.markdownDefaultEditorModeDescription") }}</small>
          <UiDropdown
            v-model="settings.markdown_default_editor_mode"
            :title="t('settings.markdownDefaultEditorMode')"
            :options="[
              { value: 'edit', label: t('common.edit') },
              { value: 'live', label: t('common.live') },
              { value: 'preview', label: t('common.preview') },
            ]"
          />
        </label>
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.readermEditSplitDefault") }}</span>
          <small>{{ t("settings.readermEditSplitDefaultDescription") }}</small>
          <span class="settings-checkbox">
            <input v-model="settings.readerm_edit_split_default" type="checkbox" />
            <span>{{ t("settings.readermEditSplitDefaultToggle") }}</span>
          </span>
        </label>
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.readermPreviewPosition") }}</span>
          <small>{{ t("settings.readermPreviewPositionDescription") }}</small>
          <UiDropdown
            v-model="settings.readerm_preview_position"
            :title="t('settings.readermPreviewPosition')"
            :options="[
              { value: 'right', label: t('settings.readermPreviewRight') },
              { value: 'bottom', label: t('settings.readermPreviewBottom') },
            ]"
          />
        </label>
        <div class="settings-general-section">
          <h3>{{ t("settings.markdownRendering") }}</h3>
          <label class="settings-checkbox">
            <input v-model="settings.markdown_code_line_numbers" type="checkbox" />
            <span>{{ t("settings.markdownCodeLineNumbers") }}</span>
          </label>
          <label class="settings-checkbox">
            <input v-model="settings.markdown_code_ligatures" type="checkbox" />
            <span>{{ t("settings.markdownCodeLigatures") }}</span>
          </label>
          <label class="settings-checkbox">
            <input v-model="settings.markdown_highlight_enabled" type="checkbox" />
            <span>{{ t("settings.markdownHighlightSyntax") }}</span>
          </label>
          <label class="settings-color-row">
            <span>{{ t("settings.markdownHighlightColor") }}</span>
            <input v-model="settings.markdown_highlight_color" type="color" />
            <input v-model="settings.markdown_highlight_color" pattern="#[0-9a-fA-F]{6}" placeholder="#fff3bf" />
          </label>
          <label class="settings-checkbox">
            <input v-model="settings.markdown_math_enabled" type="checkbox" />
            <span>{{ t("settings.markdownMathRendering") }}</span>
          </label>
          <label class="settings-checkbox">
            <input v-model="settings.markdown_html_live_enabled" type="checkbox" />
            <span>{{ t("settings.markdownHtmlLiveRendering") }}</span>
          </label>
        </div>
        <label class="settings-general-item">
          <span class="settings-general-title">{{ t("settings.historyReaderpLinkView") }}</span>
          <small>{{ t("settings.historyReaderpLinkViewDescription") }}</small>
          <UiDropdown
            v-model="settings.history_readerp_link_view"
            :title="t('settings.historyReaderpLinkView')"
            :options="[
              { value: 'pdf', label: t('readerm.sourcePdf') },
              { value: 'markdown', label: t('readerm.sourceMarkdown') },
              { value: 'summary', label: t('readerm.sourceSummary') },
            ]"
          />
        </label>
        <div class="settings-general-section">
          <h3>{{ t("settings.defaultQuoteFormats") }}</h3>
          <small>{{ t("settings.defaultQuoteFormatDescription") }}</small>
          <label class="settings-general-item quote-template-editor">
            <span class="settings-general-title">{{ t("settings.copyQuoteFormat") }}</span>
            <textarea v-model="settings.copy_quote_template" rows="5" spellcheck="false" />
          </label>
          <label class="settings-general-item quote-template-editor">
            <span class="settings-general-title">{{ t("settings.quoteToNoteFormat") }}</span>
            <textarea v-model="settings.quote_to_note_template" rows="3" spellcheck="false" />
          </label>
          <label class="settings-general-item quote-template-editor">
            <span class="settings-general-title">{{ t("settings.quoteToReadermFormat") }}</span>
            <textarea v-model="settings.quote_to_readerm_template" rows="3" spellcheck="false" />
          </label>
          <small>{{ t("settings.defaultQuoteFormatVariables") }}</small>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="button" class="primary" @click="emit('save')">{{ t("common.save") }}</button>
      </div>
    </section>

    <section v-else-if="panel === 'agent-api'" class="modal settings-modal">
      <header class="settings-modal-header">
        <h2>{{ t("settings.agentApi") }}</h2>
        <p class="modal-meta">{{ t("settings.agentDescription") }}</p>
      </header>
      <div class="settings-grid">
        <label>
          {{ t("settings.provider") }}
          <UiDropdown v-model="settings.agent_provider" :title="t('settings.provider')" :options="[{ value: 'volcengine', label: 'Volcengine Ark' }]" />
        </label>
        <label>
          {{ t("settings.apiType") }}
          <UiDropdown v-model="settings.agent_api_type" :title="t('settings.apiType')" :options="[{ value: 'chat', label: 'Chat completions' }]" />
        </label>
        <label>{{ t("settings.baseUrl") }}<input v-model="settings.ai_base_url" /></label>
        <label>{{ t("settings.model") }}<input v-model="settings.ai_model" /></label>
        <label class="settings-grid-wide">{{ t("settings.apiKey") }}<input v-model="settings.ai_api_key" type="password" /></label>
      </div>
      <div class="settings-context-options">
        <h3>{{ t("settings.aiContext") }}</h3>
        <label class="settings-checkbox">
          <input v-model="settings.ai_send_notes_context" type="checkbox" />
          <span>{{ t("settings.aiSendNotes") }}</span>
        </label>
        <label class="settings-checkbox">
          <input v-model="settings.ai_send_summary_context" type="checkbox" />
          <span>{{ t("settings.aiSendSummary") }}</span>
        </label>
        <label class="settings-checkbox">
          <input v-model="settings.ai_send_annotations_context" type="checkbox" />
          <span>{{ t("settings.aiSendAnnotations") }}</span>
        </label>
        <label class="settings-checkbox">
          <input v-model="settings.ai_send_loaded_pdf_text" type="checkbox" />
          <span>{{ t("settings.aiSendLoadedPdfText") }}</span>
        </label>
        <label class="settings-checkbox">
          <input v-model="settings.ai_send_figure_attachments" type="checkbox" />
          <span>{{ t("settings.aiSendFigureAttachments") }}</span>
        </label>
        <label class="settings-grid-wide">
          {{ t("settings.aiRedoLongerPrompt") }}
          <textarea v-model="settings.ai_redo_longer_prompt" rows="3" spellcheck="false" />
        </label>
        <label class="settings-grid-wide">
          {{ t("settings.aiRedoShorterPrompt") }}
          <textarea v-model="settings.ai_redo_shorter_prompt" rows="3" spellcheck="false" />
        </label>
        <label class="settings-grid-wide">
          {{ t("settings.aiRedoTryAgainPrompt") }}
          <textarea v-model="settings.ai_redo_try_again_prompt" rows="3" spellcheck="false" />
        </label>
      </div>
      <div class="modal-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="button" :disabled="testing === 'agent'" @click="emit('testAgent')">{{ testing === "agent" ? t("settings.testing") : t("settings.testAgent") }}</button>
        <button type="button" class="primary" @click="emit('save')">{{ t("common.save") }}</button>
      </div>
    </section>

    <section v-else-if="panel === 'ocr-api'" class="modal settings-modal">
      <header class="settings-modal-header">
        <h2>{{ t("settings.ocrApi") }}</h2>
        <p class="modal-meta">{{ t("settings.ocrDescription") }}</p>
      </header>
      <div class="settings-grid">
        <label>
          {{ t("settings.provider") }}
          <input value="SimpleTex OCR" readonly />
        </label>
        <label class="settings-grid-wide">{{ t("settings.simpletexOcrToken") }}<input v-model="settings.simpletex_ocr_token" type="password" /></label>
      </div>
      <div class="settings-context-options">
        <label class="settings-checkbox">
          <input v-model="settings.simpletex_ocr_enabled" type="checkbox" />
          <span>{{ t("settings.simpletexOcrEnabled") }}</span>
        </label>
        <small>{{ t("settings.simpletexOcrEnabledDescription") }}</small>
      </div>
      <div class="modal-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="button" :disabled="testing === 'simpletex'" @click="emit('testSimpleTexOcr')">{{ testing === "simpletex" ? t("settings.testing") : t("settings.testSimpleTexOcr") }}</button>
        <button type="button" class="primary" @click="emit('save')">{{ t("common.save") }}</button>
      </div>
    </section>

    <section v-else-if="panel === 'translation-api'" class="modal settings-modal">
      <header class="settings-modal-header">
        <h2>{{ t("settings.translationApi") }}</h2>
        <p class="modal-meta">{{ t("settings.translationDescription") }}</p>
      </header>
      <div class="settings-grid">
        <label>
          {{ t("settings.translationMode") }}
          <UiDropdown
            v-model="settings.translator_mode"
            :title="t('settings.translationMode')"
            :options="[
              { value: 'ai', label: t('settings.useAiApi') },
              { value: 'api', label: t('settings.useTranslationApi') },
            ]"
          />
        </label>
        <label>{{ t("settings.targetLanguage") }}<input v-model="settings.translator_target_language" :placeholder="t('settings.targetLanguagePlaceholder')" /></label>
        <template v-if="settings.translator_mode === 'api'">
          <label>
            {{ t("settings.translationProvider") }}
            <UiDropdown
              v-model="settings.translation_provider"
              :title="t('settings.translationProvider')"
              :options="[
                { value: 'google', label: t('translation.provider.google') },
                { value: 'baidu', label: t('translation.provider.baidu') },
              ]"
            />
          </label>
          <template v-if="settings.translation_provider === 'google'">
            <label>{{ t("settings.googleProjectId") }}<input v-model="settings.google_project_id" /></label>
            <label class="settings-grid-wide">{{ t("settings.googleApiKey") }}<input v-model="settings.google_api_key" type="password" /></label>
          </template>
          <template v-else>
            <label>{{ t("settings.baiduAppId") }}<input v-model="settings.baidu_app_id" /></label>
            <label class="settings-grid-wide">{{ t("settings.baiduAppKey") }}<input v-model="settings.baidu_app_key" type="password" /></label>
          </template>
        </template>
      </div>
      <div class="modal-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="button" :disabled="testing === 'translation'" @click="emit('testTranslation')">{{ testing === "translation" ? t("settings.testing") : t("settings.testTranslation") }}</button>
        <button type="button" class="primary" @click="emit('save')">{{ t("common.save") }}</button>
      </div>
    </section>

    <section v-else-if="panel === 'file-associations'" class="modal settings-modal">
      <header class="settings-modal-header">
        <h2>{{ t("settings.fileAssociations") }}</h2>
        <p class="modal-meta">{{ t("settings.fileAssociationsDescription") }}</p>
      </header>
      <div class="file-association-status">
        <article v-for="item in fileAssociationStatus?.associations || []" :key="item.extension">
          <div>
            <strong>{{ item.extension }}</strong>
            <span>{{ fileAssociationStateLabel(item) }}</span>
          </div>
          <button
            type="button"
            :disabled="Boolean(fileAssociationBusy) || fileAssociationStatus?.supported === false"
            @click="emit('updateFileAssociation', item.extension, item.associated)"
          >
            {{ fileAssociationBusy === item.extension ? t("common.waiting") : item.associated ? t("settings.unbindFileAssociation") : t("settings.bindFileAssociation") }}
          </button>
        </article>
        <p v-if="fileAssociationStatus && !fileAssociationStatus.supported" class="modal-meta">
          {{ t("settings.fileAssociationsUnsupported") }}
        </p>
      </div>
      <div class="modal-actions">
        <button type="button" @click="emit('close')">{{ t("common.close") }}</button>
        <button
          type="button"
          class="primary"
          :disabled="Boolean(fileAssociationBusy) || fileAssociationStatus?.supported === false"
          @click="emit('registerFileAssociations')"
        >
          {{ fileAssociationBusy === "all" ? t("common.waiting") : t("settings.bindFileAssociations") }}
        </button>
      </div>
    </section>

    <section v-else-if="panel === 'system-prompt'" class="modal settings-modal prompt-settings-modal">
      <header class="settings-modal-header">
        <h2>{{ t("settings.systemPrompt") }}</h2>
        <p class="modal-meta">{{ t("settings.systemPromptDescription") }}</p>
      </header>
      <div class="settings-grid">
        <label>
          {{ t("settings.professionalField") }}
          <input v-model="settings.professional_field" :placeholder="t('settings.professionalFieldPlaceholder')" />
        </label>
        <label>
          {{ t("settings.researchArea") }}
          <input v-model="settings.research_area" :placeholder="t('settings.researchAreaPlaceholder')" />
        </label>
        <label class="settings-grid-wide">
          {{ t("settings.answerLanguage") }}
          <input v-model="settings.translator_target_language" :placeholder="t('settings.targetLanguagePlaceholder')" />
        </label>
      </div>
      <label class="prompt-template-editor">
        {{ t("settings.readerPrompt") }}
        <textarea v-model="settings.reader_prompt" rows="12" spellcheck="false" />
      </label>
      <div class="template-status-list">
        <article v-for="template in promptTemplatePreview.filter((item) => item.name === 'system')" :key="template.name" class="template-status-card">
          <strong>{{ template.fileName }}</strong>
          <span>{{ template.available ? t("common.loaded") : t("common.missing") }}</span>
          <small>{{ template.path }}</small>
          <pre>{{ template.preview }}</pre>
        </article>
      </div>
      <div class="modal-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="button" class="primary" @click="emit('save')">{{ t("common.save") }}</button>
      </div>
    </section>

    <section v-else class="modal settings-modal prompt-settings-modal">
      <header class="settings-modal-header">
        <h2>{{ t("settings.summaryPrompt") }}</h2>
        <p class="modal-meta">{{ t("settings.summaryDescription") }}</p>
      </header>
      <label>
        {{ t("settings.summarySource") }}
        <UiDropdown
          v-model="settings.summary_source"
          :title="t('settings.summarySource')"
          :options="[
            { value: 'pdf-extractor', label: t('settings.summaryPdfExtractor') },
            { value: 'pdf-direct', label: t('settings.summaryPdfDirect') },
            { value: 'latex', label: t('settings.summaryLatex') },
          ]"
        />
      </label>
      <label>
        {{ t("settings.summaryFigureAttachments") }}
        <input v-model.number="settings.summary_figure_attachment_limit" type="number" min="0" max="20" step="1" />
        <small>{{ t("settings.summaryFigureAttachmentsDescription") }}</small>
      </label>
      <label>
        {{ t("settings.summaryTextCharLimit") }}
        <input v-model.number="settings.summary_text_char_limit" type="number" min="0" max="2000000" step="1000" />
        <small>{{ t("settings.summaryTextCharLimitDescription") }}</small>
      </label>
      <label class="prompt-template-editor">
        {{ t("settings.summaryTemplate") }}
        <textarea v-model="settings.summary_template" rows="18" spellcheck="false" />
      </label>
      <div class="template-status-list">
        <article v-for="template in promptTemplatePreview.filter((item) => item.name === 'literature-read' || item.name === 'system')" :key="template.name" class="template-status-card">
          <strong>{{ template.fileName }}</strong>
          <span>{{ template.available ? t("common.loaded") : t("common.missing") }}</span>
          <small>{{ template.path }}</small>
          <pre>{{ template.preview }}</pre>
        </article>
      </div>
      <div class="modal-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="button" class="primary" @click="emit('save')">{{ t("common.save") }}</button>
      </div>
    </section>
  </div>
</template>
