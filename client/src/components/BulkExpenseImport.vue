<script setup lang="ts">
import Papa from 'papaparse'
import { computed, ref } from 'vue'
import { ApiError, api } from '../api'
import { formatYen } from '../format'

interface Member {
  id: number
  name: string
}

interface ExistingExpense {
  expenseDate: string | null
  description: string
  amount: string
  paidBy: number
}

interface ImportExpense {
  expenseDate: string
  description: string
  category: string
  amount: string
  paidBy: number
  payerName: string
  notes: string
}

interface PreviewRow {
  line: number
  expense: ImportExpense
  errors: string[]
  duplicate: boolean
  include: boolean
}

const props = defineProps<{
  periodId: number
  startDate: string
  endDate: string
  members: Member[]
  existingExpenses: ExistingExpense[]
}>()

const emit = defineEmits<{
  imported: []
}>()

const sourceName = ref('')
const previewRows = ref<PreviewRow[]>([])
const parseError = ref('')
const submitting = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const selectedRows = computed(() =>
  previewRows.value.filter((row) => row.include && row.errors.length === 0),
)
const selectedTotal = computed(() =>
  selectedRows.value.reduce((total, row) => total + BigInt(row.expense.amount || '0'), 0n),
)
const duplicateCount = computed(() => previewRows.value.filter((row) => row.duplicate).length)
const errorCount = computed(() => previewRows.value.filter((row) => row.errors.length > 0).length)

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function downloadTemplate() {
  const payer = props.members[0]?.name || 'Payer name'
  const content = [
    'date,description,category,amount,paid_by,notes',
    [props.startDate, 'Example expense', 'Household', '1000', csvCell(payer), ''].join(','),
  ].join('\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `expenses-${props.startDate}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function duplicateKey(
  expense: Pick<ImportExpense, 'expenseDate' | 'description' | 'amount' | 'paidBy'>,
) {
  return [
    expense.expenseDate,
    expense.description.trim().toLowerCase(),
    expense.amount.replace(/^0+(?=\d)/, ''),
    expense.paidBy,
  ].join('|')
}

function validDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`)
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

function parseRows(rows: Record<string, unknown>[]) {
  const existingKeys = new Set(
    props.existingExpenses.map((expense) =>
      duplicateKey({
        expenseDate: expense.expenseDate ?? '',
        description: expense.description,
        amount: String(expense.amount),
        paidBy: Number(expense.paidBy),
      }),
    ),
  )
  const seenKeys = new Set<string>()

  previewRows.value = rows.map((row, index) => {
    const payerValue = normalizeText(row.paid_by ?? row.payer ?? row.paidby)
    const payer = props.members.find(
      (member) =>
        member.name.toLowerCase() === payerValue.toLowerCase() || String(member.id) === payerValue,
    )
    const expense: ImportExpense = {
      expenseDate: normalizeText(row.date ?? row.expense_date),
      description: normalizeText(row.description),
      category: normalizeText(row.category),
      amount: normalizeText(row.amount).replace(/[¥,\s]/g, ''),
      paidBy: payer?.id ?? 0,
      payerName: payer?.name ?? payerValue,
      notes: normalizeText(row.notes),
    }
    const errors: string[] = []
    if (expense.expenseDate) {
      if (!validDate(expense.expenseDate)) errors.push('Invalid date')
      else if (expense.expenseDate < props.startDate || expense.expenseDate > props.endDate) {
        errors.push('Date outside period')
      }
    }
    if (!expense.description) errors.push('Description required')
    else if (expense.description.length > 160) errors.push('Description too long')
    if (!/^\d{1,13}$/.test(expense.amount) || BigInt(expense.amount || '0') <= 0n) {
      errors.push('Invalid whole-yen amount')
    }
    if (!payer) errors.push('Payer not recognized')
    if (expense.category.length > 80) errors.push('Category too long')
    if (expense.notes.length > 2000) errors.push('Notes too long')

    const key = duplicateKey(expense)
    const duplicate = existingKeys.has(key) || seenKeys.has(key)
    seenKeys.add(key)
    return {
      line: index + 2,
      expense,
      errors,
      duplicate,
      include: errors.length === 0 && !duplicate,
    }
  })
}

function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  parseError.value = ''
  previewRows.value = []
  if (!file) return
  sourceName.value = file.name
  if (!file.name.toLowerCase().endsWith('.csv')) {
    parseError.value = 'Choose a CSV file.'
    return
  }
  if (file.size > 2_000_000) {
    parseError.value = 'CSV files must be smaller than 2 MB.'
    return
  }

  Papa.parse<Record<string, unknown>>(file, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader,
    complete(result) {
      if (result.errors.length > 0) {
        parseError.value = result.errors[0]?.message || 'The CSV could not be parsed.'
        return
      }
      if (result.data.length === 0) {
        parseError.value = 'The CSV does not contain any expense rows.'
        return
      }
      if (result.data.length > 500) {
        parseError.value = 'A CSV can contain no more than 500 expense rows.'
        return
      }
      parseRows(result.data)
    },
    error(error) {
      parseError.value = error.message
    },
  })
}

function reset() {
  sourceName.value = ''
  previewRows.value = []
  parseError.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

async function submitImport() {
  if (selectedRows.value.length === 0) {
    parseError.value = 'Select at least one valid expense to import.'
    return
  }
  submitting.value = true
  parseError.value = ''
  try {
    await api(`/periods/${props.periodId}/imports`, {
      method: 'POST',
      body: {
        sourceName: sourceName.value,
        rows: selectedRows.value.map(({ expense }) => expense),
      },
    })
    reset()
    emit('imported')
  } catch (error: unknown) {
    parseError.value =
      error instanceof ApiError ? error.message : 'The expenses could not be imported.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="card mb-8 overflow-hidden">
    <div class="border-b bg-slate-50/70 p-5 sm:p-6">
      <p class="eyebrow">Bulk entry</p>
      <h2 class="mt-1 text-xl font-semibold">Import expenses from CSV</h2>
      <p class="mt-2 max-w-2xl text-sm text-ink-500">
        Upload as many CSV batches as needed. Each file appends expenses to this period.
      </p>
    </div>

    <div class="p-5 sm:p-6">
      <div class="rounded-xl border border-dashed border-slate-300 bg-white p-5">
        <label class="label" for="csv-file">Choose a CSV file</label>
        <input
          id="csv-file"
          ref="fileInput"
          class="block w-full text-sm text-ink-700 file:mr-4 file:rounded-lg file:border-0 file:bg-mint-50 file:px-3 file:py-2 file:font-semibold file:text-mint-700 hover:file:bg-mint-100"
          type="file"
          accept=".csv,text/csv"
          @change="chooseFile"
        />
        <p class="mt-3 text-xs leading-5 text-ink-500">
          Required columns:
          <code>description, amount, paid_by</code>. Optional columns:
          <code>date, category, notes</code>. Use household names for <code>paid_by</code>.
        </p>
        <button
          class="mt-2 text-xs font-semibold text-mint-700 hover:text-mint-600"
          type="button"
          @click="downloadTemplate"
        >
          Download a CSV template
        </button>
      </div>

      <div
        v-if="parseError"
        role="alert"
        class="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {{ parseError }}
      </div>

      <template v-if="previewRows.length">
        <div class="mt-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h3 class="font-semibold">Import preview</h3>
            <p class="mt-1 text-sm text-ink-500">
              {{ selectedRows.length }} selected · {{ formatYen(selectedTotal.toString()) }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2 text-xs">
            <span
              v-if="duplicateCount"
              class="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800"
            >
              {{ duplicateCount }} possible duplicates
            </span>
            <span
              v-if="errorCount"
              class="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-700"
            >
              {{ errorCount }} invalid rows
            </span>
          </div>
        </div>

        <div class="mt-4 max-h-96 overflow-auto rounded-xl border">
          <table class="w-full min-w-3xl border-collapse text-left text-sm">
            <thead class="sticky top-0 bg-slate-50 text-xs text-ink-500">
              <tr>
                <th class="w-12 px-3 py-2.5">Add</th>
                <th class="px-3 py-2.5">Line</th>
                <th class="px-3 py-2.5">Date</th>
                <th class="px-3 py-2.5">Description</th>
                <th class="px-3 py-2.5">Paid by</th>
                <th class="px-3 py-2.5 text-right">Amount</th>
                <th class="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr
                v-for="row in previewRows"
                :key="row.line"
                :class="{ 'bg-red-50/50': row.errors.length }"
              >
                <td class="px-3 py-3">
                  <input
                    v-model="row.include"
                    class="size-4 accent-mint-600"
                    type="checkbox"
                    :disabled="row.errors.length > 0"
                    :aria-label="`Include CSV line ${row.line}`"
                  />
                </td>
                <td class="px-3 py-3 text-ink-500">{{ row.line }}</td>
                <td class="whitespace-nowrap px-3 py-3">
                  {{ row.expense.expenseDate || 'No date' }}
                </td>
                <td class="px-3 py-3 font-medium">{{ row.expense.description || '—' }}</td>
                <td class="px-3 py-3">{{ row.expense.payerName || '—' }}</td>
                <td class="whitespace-nowrap px-3 py-3 text-right font-medium">
                  {{ /^\d+$/.test(row.expense.amount) ? formatYen(row.expense.amount) : '—' }}
                </td>
                <td class="px-3 py-3">
                  <span v-if="row.errors.length" class="text-xs text-red-700">
                    {{ row.errors.join(', ') }}
                  </span>
                  <span v-else-if="row.duplicate" class="text-xs text-amber-700">
                    Possible duplicate
                  </span>
                  <span v-else class="text-xs text-mint-700">Ready</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-5 flex flex-col-reverse justify-end gap-3 sm:flex-row">
          <button class="button-secondary" type="button" @click="reset">Cancel</button>
          <button
            class="button-primary"
            type="button"
            :disabled="submitting || selectedRows.length === 0"
            @click="submitImport"
          >
            {{ submitting ? 'Importing…' : `Import ${selectedRows.length} expenses` }}
          </button>
        </div>
      </template>
    </div>
  </section>
</template>
