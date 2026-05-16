<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Download, Trash2, X } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import type { PdfTableSheet } from "@/pdf/pdfTypes";
import { filterRows, sortRows, tableSheetToCsv, type SheetSort } from "@/services/TableSheetService";

const props = defineProps<{
  sheet: PdfTableSheet | null;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "exportCsv", csv: string): void;
}>();

const filter = ref("");
const sort = ref<SheetSort>(null);
const editedColumns = ref<string[]>([]);
const editedRows = ref<string[][]>([]);

const editedSheet = computed(() => {
  if (!props.sheet) return null;
  return {
    ...props.sheet,
    columns: editedColumns.value,
    rows: editedRows.value,
  };
});

watch(() => props.sheet, (sheet) => {
  filter.value = "";
  sort.value = null;
  editedColumns.value = sheet?.columns.slice() || [];
  editedRows.value = sheet?.rows.map((row) => editedColumns.value.map((_, index) => row[index] || "")) || [];
}, { immediate: true });

const visibleRows = computed(() => {
  if (!editedSheet.value) return [];
  return sortRows(filterRows(editedSheet.value, filter.value), sort.value);
});

const visibleRowEntries = computed(() => {
  return visibleRows.value
    .map((row) => ({ row, index: editedRows.value.indexOf(row) }))
    .filter((entry) => entry.index !== -1);
});

function toggleSort(column: number) {
  if (!sort.value || sort.value.column !== column) {
    sort.value = { column, direction: "asc" };
    return;
  }
  if (sort.value.direction === "asc") {
    sort.value = { column, direction: "desc" };
    return;
  }
  sort.value = null;
}

function deleteColumn(columnIndex: number) {
  editedColumns.value.splice(columnIndex, 1);
  editedRows.value.forEach((row) => row.splice(columnIndex, 1));
  if (sort.value?.column === columnIndex) sort.value = null;
  if (sort.value && sort.value.column > columnIndex) {
    sort.value = { ...sort.value, column: sort.value.column - 1 };
  }
}

function deleteRow(rowIndex: number) {
  editedRows.value.splice(rowIndex, 1);
}

function exportCsv() {
  if (!editedSheet.value) return;
  emit("exportCsv", tableSheetToCsv({ columns: editedColumns.value, rows: visibleRows.value }));
}
</script>

<template>
  <div v-if="sheet" class="modal-backdrop">
    <section class="table-modal">
      <header>
        <div>
          <h2>{{ sheet.title }}</h2>
          <p>{{ sheet.caption }}</p>
        </div>
        <button type="button" :title="t('table.close')" @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="table-tools">
        <input v-model="filter" :placeholder="t('table.filterPlaceholder')" />
        <span>{{ t("common.rowsCount", { visible: visibleRows.length, total: editedRows.length }) }}</span>
        <button type="button" class="primary" @click="exportCsv"><Download :size="16" /> {{ t("common.exportCsv") }}</button>
      </div>
      <div class="sheet-grid-wrap">
        <table class="sheet-grid">
          <thead>
            <tr>
              <th class="sheet-action-cell"></th>
              <th v-for="(column, index) in editedColumns" :key="`${column}-${index}`">
                <div class="sheet-column-head">
                  <button type="button" @click="toggleSort(index)">
                    {{ column || t("table.column", { index: index + 1 }) }}
                    <span v-if="sort?.column === index">{{ sort.direction === "asc" ? "Asc" : "Desc" }}</span>
                  </button>
                  <button type="button" class="sheet-delete" :title="t('table.deleteColumn')" @click="deleteColumn(index)">
                    <Trash2 :size="14" />
                  </button>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in visibleRowEntries" :key="entry.index">
              <td class="sheet-action-cell">
                <button type="button" class="sheet-delete" :title="t('table.deleteRow')" @click="deleteRow(entry.index)">
                  <Trash2 :size="14" />
                </button>
              </td>
              <td v-for="(_, columnIndex) in editedColumns" :key="columnIndex">
                <input v-model="editedRows[entry.index][columnIndex]" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
