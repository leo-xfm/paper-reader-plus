<script setup lang="ts">
import UiDropdown from "@/components/UiDropdown.vue";
import { useI18n } from "@/i18n";
import type { FileAssociationStatus, PromptTemplateStatus, Settings } from "@/types";

export type SettingsPanel = "agent-api" | "translation-api" | "network-proxy" | "file-associations" | "system-prompt" | "summary-prompt";

defineProps<{
  panel: SettingsPanel;
  settings: Settings;
  promptTemplatePreview: Array<PromptTemplateStatus & { preview: string }>;
  testing: "agent" | "translation" | null;
  fileAssociationStatus: FileAssociationStatus | null;
  fileAssociationBusy: boolean;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "save"): void;
  (event: "testAgent"): void;
  (event: "testTranslation"): void;
  (event: "registerFileAssociations"): void;
}>();
</script>

<template>
  <div class="modal-backdrop">
    <section v-if="panel === 'agent-api'" class="modal settings-modal">
      <header class="settings-modal-header">
        <h2>{{ t("settings.agentApi") }}</h2>
        <p class="modal-meta">{{ t("settings.agentDescription") }}</p>
      </header>
      <div class="settings-grid">
        <label>
          {{ t("settings.interfaceLanguage") }}
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
      </div>
      <div class="modal-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="button" :disabled="testing === 'agent'" @click="emit('testAgent')">{{ testing === "agent" ? t("settings.testing") : t("settings.testAgent") }}</button>
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

    <section v-else-if="panel === 'network-proxy'" class="modal settings-modal">
      <header class="settings-modal-header">
        <h2>{{ t("settings.networkProxy") }}</h2>
        <p class="modal-meta">{{ t("settings.networkProxyDescription") }}</p>
      </header>
      <div class="settings-grid">
        <label class="settings-checkbox settings-grid-wide">
          <input v-model="settings.network_proxy_enabled" type="checkbox" />
          <span>{{ t("settings.enableProxy") }}</span>
        </label>
        <label class="settings-grid-wide">
          {{ t("settings.proxyUrl") }}
          <input v-model="settings.network_proxy_url" placeholder="http://127.0.0.1:7890" />
        </label>
      </div>
      <div class="modal-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
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
          <strong>{{ item.extension }}</strong>
          <span>{{ item.associated ? t("settings.fileAssociationBound") : t("settings.fileAssociationUnbound") }}</span>
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
          :disabled="fileAssociationBusy || fileAssociationStatus?.supported === false"
          @click="emit('registerFileAssociations')"
        >
          {{ fileAssociationBusy ? t("common.waiting") : t("settings.bindFileAssociations") }}
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
