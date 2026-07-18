<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError, api } from '../api'
import BulkExpenseImport from '../components/BulkExpenseImport.vue'
import { formatDate, formatDateTime, formatYen, todayIso } from '../format'

const route = useRoute()

interface Period {
  id: number
  label: string
  startDate: string
  endDate: string
  status: 'open' | 'closed'
}

interface Member {
  id: number
  name: string
  income: string
}

interface Expense {
  id: number
  expenseDate: string | null
  description: string
  category: string | null
  amount: string
  importId: number | null
  paidBy: number
  payerName: string
  notes: string | null
}

interface RecurringExpense {
  id: number
  description: string
  category: string | null
  amount: string
  paidBy: number
  payerName: string
  notes: string | null
}

interface OwedAmount {
  id: number
  amount: string
  description: string
  fromUserId: number
  fromName: string
  toUserId: number
  toName: string
  notes: string | null
}

interface ImportBatch {
  id: number
  sourceName: string
  rowCount: number
  totalAmount: string
  importedBy: string
  importedAt: string
}

interface SummaryMember {
  id: number
  name: string
  income: string
  percentage: number
  fairShare: string
  paid: string
  balance: string
}

interface Summary {
  ready: boolean
  reason: string | null
  totalIncome: string
  totalExpenses: string
  totalOwedAdjustments: string
  members: SummaryMember[]
  settlement: {
    fromUserId: number
    fromName: string
    toUserId: number
    toName: string
    amount: string
  } | null
}

interface PeriodResponse {
  period: Period
  members: Member[]
  expenses: Expense[]
  owedAmounts: OwedAmount[]
  recurringExpenses: RecurringExpense[]
  imports: ImportBatch[]
  summary: Summary
}

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const period = ref<Period | null>(null)
const members = ref<Member[]>([])
const expenses = ref<Expense[]>([])
const owedAmounts = ref<OwedAmount[]>([])
const recurringExpenses = ref<RecurringExpense[]>([])
const imports = ref<ImportBatch[]>([])
const summary = ref<Summary>({
  ready: false,
  reason: 'Enter household income to calculate the split.',
  totalIncome: '0',
  totalExpenses: '0',
  totalOwedAdjustments: '0',
  members: [],
  settlement: null,
})
const incomeDraft = reactive<Record<number, string>>({})
const editingExpenseId = ref<number | null>(null)
const editingOwedAmountId = ref<number | null>(null)
const editingRecurringExpenseId = ref<number | null>(null)
const showBulkImport = ref(false)
const showRecurringForm = ref(false)

const expenseForm = reactive({
  expenseDate: todayIso(),
  description: '',
  category: '',
  amount: '',
  paidBy: '',
  notes: '',
})

const owedAmountForm = reactive({
  description: '',
  amount: '',
  fromUserId: '',
  toUserId: '',
  notes: '',
})

const recurringExpenseForm = reactive({
  description: '',
  category: '',
  amount: '',
  paidBy: '',
  notes: '',
  applyToCurrentPeriod: true,
})

const isClosed = computed(() => period.value?.status === 'closed')

watch(isClosed, (closed) => {
  if (closed) {
    recurringExpenseForm.applyToCurrentPeriod = false
  }
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api<PeriodResponse>(`/periods/${route.params.id}`)
    period.value = data.period
    members.value = data.members
    expenses.value = data.expenses
    owedAmounts.value = data.owedAmounts
    recurringExpenses.value = data.recurringExpenses
    imports.value = data.imports
    summary.value = data.summary
    for (const member of data.members) incomeDraft[member.id] = String(member.income)
    const firstMember = data.members[0]
    if (!expenseForm.paidBy && firstMember) {
      expenseForm.paidBy = String(firstMember.id)
    }
    if (!owedAmountForm.fromUserId && firstMember) {
      owedAmountForm.fromUserId = String(firstMember.id)
    }
    if (!owedAmountForm.toUserId && data.members[1]) {
      owedAmountForm.toUserId = String(data.members[1].id)
    }
    if (!recurringExpenseForm.paidBy && firstMember) {
      recurringExpenseForm.paidBy = String(firstMember.id)
    }
    if (
      expenseForm.expenseDate < data.period.startDate ||
      expenseForm.expenseDate > data.period.endDate
    ) {
      expenseForm.expenseDate = data.period.endDate
    }
  } catch (requestError: unknown) {
    error.value =
      requestError instanceof ApiError ? requestError.message : 'Unable to load this period.'
  } finally {
    loading.value = false
  }
}

async function saveIncome(member: Member) {
  if (!period.value) return
  error.value = ''
  saving.value = true
  try {
    await api(`/periods/${period.value.id}/incomes/${member.id}`, {
      method: 'PUT',
      body: { amount: incomeDraft[member.id] || '0' },
    })
    await load()
  } catch (requestError: unknown) {
    error.value = requestError instanceof ApiError ? requestError.message : 'Unable to save income.'
  } finally {
    saving.value = false
  }
}

function clearExpenseForm() {
  if (!period.value) return
  editingExpenseId.value = null
  expenseForm.expenseDate =
    todayIso() < period.value.startDate || todayIso() > period.value.endDate
      ? period.value.endDate
      : todayIso()
  expenseForm.description = ''
  expenseForm.category = ''
  expenseForm.amount = ''
  expenseForm.paidBy = String(members.value[0]?.id || '')
  expenseForm.notes = ''
}

function clearOwedAmountForm() {
  editingOwedAmountId.value = null
  owedAmountForm.description = ''
  owedAmountForm.amount = ''
  owedAmountForm.fromUserId = String(members.value[0]?.id || '')
  owedAmountForm.toUserId = String(members.value[1]?.id || members.value[0]?.id || '')
  owedAmountForm.notes = ''
}

function clearRecurringExpenseForm() {
  editingRecurringExpenseId.value = null
  recurringExpenseForm.description = ''
  recurringExpenseForm.category = ''
  recurringExpenseForm.amount = ''
  recurringExpenseForm.paidBy = String(members.value[0]?.id || '')
  recurringExpenseForm.notes = ''
  recurringExpenseForm.applyToCurrentPeriod = !!period.value && !isClosed.value
}

function toggleRecurringForm() {
  showRecurringForm.value = !showRecurringForm.value
  if (showRecurringForm.value && !editingRecurringExpenseId.value) {
    clearRecurringExpenseForm()
  }
}

function closeRecurringForm() {
  clearRecurringExpenseForm()
  showRecurringForm.value = false
}

function editExpense(expense: Expense) {
  editingExpenseId.value = expense.id
  expenseForm.expenseDate = expense.expenseDate ?? ''
  expenseForm.description = expense.description
  expenseForm.category = expense.category || ''
  expenseForm.amount = String(expense.amount)
  expenseForm.paidBy = String(expense.paidBy)
  expenseForm.notes = expense.notes || ''
  document.querySelector('#expense-form')?.scrollIntoView({ behavior: 'smooth' })
}

function editOwedAmount(owedAmount: OwedAmount) {
  editingOwedAmountId.value = owedAmount.id
  owedAmountForm.description = owedAmount.description
  owedAmountForm.amount = String(owedAmount.amount)
  owedAmountForm.fromUserId = String(owedAmount.fromUserId)
  owedAmountForm.toUserId = String(owedAmount.toUserId)
  owedAmountForm.notes = owedAmount.notes || ''
  document.querySelector('#owed-amount-form')?.scrollIntoView({ behavior: 'smooth' })
}

function editRecurringExpense(expense: RecurringExpense) {
  editingRecurringExpenseId.value = expense.id
  showRecurringForm.value = true
  recurringExpenseForm.description = expense.description
  recurringExpenseForm.category = expense.category || ''
  recurringExpenseForm.amount = String(expense.amount)
  recurringExpenseForm.paidBy = String(expense.paidBy)
  recurringExpenseForm.notes = expense.notes || ''
  recurringExpenseForm.applyToCurrentPeriod = false
  document.querySelector('#recurring-expense-form')?.scrollIntoView({ behavior: 'smooth' })
}

async function saveExpense() {
  if (!period.value) return
  error.value = ''
  saving.value = true
  try {
    const path = editingExpenseId.value
      ? `/expenses/${editingExpenseId.value}`
      : `/periods/${period.value.id}/expenses`
    await api(path, {
      method: editingExpenseId.value ? 'PUT' : 'POST',
      body: expenseForm,
    })
    clearExpenseForm()
    await load()
  } catch (requestError: unknown) {
    error.value =
      requestError instanceof ApiError ? requestError.message : 'Unable to save the expense.'
  } finally {
    saving.value = false
  }
}

async function saveOwedAmount() {
  if (!period.value) return
  error.value = ''
  saving.value = true
  try {
    const path = editingOwedAmountId.value
      ? `/owed-amounts/${editingOwedAmountId.value}`
      : `/periods/${period.value.id}/owed-amounts`
    await api(path, {
      method: editingOwedAmountId.value ? 'PUT' : 'POST',
      body: owedAmountForm,
    })
    clearOwedAmountForm()
    await load()
  } catch (requestError: unknown) {
    error.value =
      requestError instanceof ApiError ? requestError.message : 'Unable to save the owed amount.'
  } finally {
    saving.value = false
  }
}

async function saveRecurringExpense() {
  if (!period.value) return
  error.value = ''
  saving.value = true
  try {
    const path = editingRecurringExpenseId.value
      ? `/recurring-expenses/${editingRecurringExpenseId.value}`
      : '/recurring-expenses'
    const body = editingRecurringExpenseId.value
      ? {
          description: recurringExpenseForm.description,
          category: recurringExpenseForm.category,
          amount: recurringExpenseForm.amount,
          paidBy: recurringExpenseForm.paidBy,
          notes: recurringExpenseForm.notes,
        }
      : {
          description: recurringExpenseForm.description,
          category: recurringExpenseForm.category,
          amount: recurringExpenseForm.amount,
          paidBy: recurringExpenseForm.paidBy,
          notes: recurringExpenseForm.notes,
          applyToPeriodId:
            recurringExpenseForm.applyToCurrentPeriod && !isClosed.value ? period.value.id : null,
        }
    await api(path, {
      method: editingRecurringExpenseId.value ? 'PUT' : 'POST',
      body,
    })
    clearRecurringExpenseForm()
    showRecurringForm.value = false
    await load()
  } catch (requestError: unknown) {
    error.value =
      requestError instanceof ApiError
        ? requestError.message
        : 'Unable to save the recurring expense.'
  } finally {
    saving.value = false
  }
}

async function removeExpense(expense: Expense) {
  if (!window.confirm(`Delete “${expense.description}”?`)) return
  error.value = ''
  try {
    await api(`/expenses/${expense.id}`, { method: 'DELETE', body: {} })
    await load()
  } catch (requestError: unknown) {
    error.value =
      requestError instanceof ApiError ? requestError.message : 'Unable to delete the expense.'
  }
}

async function removeOwedAmount(owedAmount: OwedAmount) {
  if (!window.confirm(`Delete “${owedAmount.description}”?`)) return
  error.value = ''
  try {
    await api(`/owed-amounts/${owedAmount.id}`, { method: 'DELETE', body: {} })
    await load()
  } catch (requestError: unknown) {
    error.value =
      requestError instanceof ApiError ? requestError.message : 'Unable to delete the owed amount.'
  }
}

async function removeRecurringExpense(expense: RecurringExpense) {
  if (
    !window.confirm(
      `Delete recurring expense “${expense.description}”? This will not remove expenses already copied into past periods.`,
    )
  ) {
    return
  }
  error.value = ''
  try {
    await api(`/recurring-expenses/${expense.id}`, { method: 'DELETE', body: {} })
    await load()
  } catch (requestError: unknown) {
    error.value =
      requestError instanceof ApiError
        ? requestError.message
        : 'Unable to delete the recurring expense.'
  }
}

async function undoImport(batch: ImportBatch) {
  if (
    !window.confirm(
      `Undo “${batch.sourceName}”? This will delete its ${batch.rowCount} imported expenses.`,
    )
  ) {
    return
  }
  error.value = ''
  try {
    await api(`/imports/${batch.id}`, { method: 'DELETE', body: {} })
    await load()
  } catch (requestError: unknown) {
    error.value =
      requestError instanceof ApiError ? requestError.message : 'Unable to undo the import.'
  }
}

async function importComplete() {
  await load()
}

async function toggleStatus() {
  if (!period.value) return
  const nextStatus = isClosed.value ? 'open' : 'closed'
  if (
    nextStatus === 'closed' &&
    !window.confirm('Close this period? Income, expenses, and owed amounts will become read-only.')
  ) {
    return
  }
  error.value = ''
  saving.value = true
  try {
    await api(`/periods/${period.value.id}`, {
      method: 'PUT',
      body: { ...period.value, status: nextStatus },
    })
    await load()
  } catch (requestError: unknown) {
    error.value =
      requestError instanceof ApiError ? requestError.message : 'Unable to update the period.'
  } finally {
    saving.value = false
  }
}

onMounted(load)
watch(() => route.params.id, load)
</script>

<template>
  <div v-if="loading" class="card p-10 text-center text-sm text-ink-500">Loading calculation…</div>

  <section v-else-if="period">
    <RouterLink
      to="/"
      class="mb-6 inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-mint-700"
    >
      <span>←</span> All periods
    </RouterLink>

    <div class="mb-8">
      <div>
        <div class="flex items-center gap-3">
          <p class="eyebrow">{{ isClosed ? 'Closed period' : 'Open period' }}</p>
          <span v-if="isClosed" class="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-ink-700">
            Read only
          </span>
        </div>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{{ period.label }}</h1>
        <p class="mt-2 text-sm text-ink-500">
          {{ formatDate(period.startDate) }} – {{ formatDate(period.endDate) }}
        </p>
      </div>
    </div>

    <div
      v-if="error"
      role="alert"
      class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {{ error }}
    </div>

    <form
      v-if="!isClosed"
      id="expense-form"
      class="card mb-8 p-5 sm:p-6"
      @submit.prevent="saveExpense"
    >
      <div class="mb-5 flex items-center justify-between">
        <div>
          <p class="eyebrow">{{ editingExpenseId ? 'Editing expense' : 'New expense' }}</p>
          <h2 class="mt-1 text-xl font-semibold">
            {{ editingExpenseId ? 'Update expense' : 'Add a shared expense' }}
          </h2>
        </div>
        <button
          v-if="editingExpenseId"
          class="text-sm text-ink-500 hover:text-ink-950"
          type="button"
          @click="clearExpenseForm"
        >
          Cancel
        </button>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label class="label" for="expenseDate">Date</label>
          <input
            id="expenseDate"
            v-model="expenseForm.expenseDate"
            class="input"
            type="date"
            :min="period.startDate"
            :max="period.endDate"
            required
          />
        </div>
        <div class="sm:col-span-1 lg:col-span-2">
          <label class="label" for="description">Description</label>
          <input
            id="description"
            v-model="expenseForm.description"
            class="input"
            placeholder="Rent, groceries, utilities…"
            maxlength="160"
            required
          />
        </div>
        <div>
          <label class="label" for="amount">Amount</label>
          <div class="relative">
            <span class="pointer-events-none absolute top-2.5 left-3.5 text-sm text-ink-500"
              >¥</span
            >
            <input
              id="amount"
              v-model="expenseForm.amount"
              class="input !pl-8"
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              placeholder="0"
              required
            />
          </div>
        </div>
        <div>
          <label class="label" for="paidBy">Paid by</label>
          <select id="paidBy" v-model="expenseForm.paidBy" class="input" required>
            <option v-for="member in members" :key="member.id" :value="String(member.id)">
              {{ member.name }}
            </option>
          </select>
        </div>
        <div>
          <label class="label" for="category">Category</label>
          <input
            id="category"
            v-model="expenseForm.category"
            class="input"
            placeholder="Optional"
            maxlength="80"
          />
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="notes">Notes</label>
          <input
            id="notes"
            v-model="expenseForm.notes"
            class="input"
            placeholder="Optional details"
            maxlength="2000"
          />
        </div>
      </div>
      <div class="mt-5 flex justify-end">
        <button class="button-primary" type="submit" :disabled="saving">
          {{ saving ? 'Saving…' : editingExpenseId ? 'Update expense' : 'Add expense' }}
        </button>
      </div>
    </form>

    <div class="mb-8">
      <div class="mb-3 flex items-end justify-between">
        <div>
          <p class="eyebrow">Expenses</p>
          <h2 class="mt-1 text-xl font-semibold">Shared expenses</h2>
        </div>
        <p class="text-sm text-ink-500">{{ expenses.length }} total</p>
      </div>

      <div v-if="!expenses.length" class="card border-dashed p-9 text-center text-sm text-ink-500">
        No expenses have been added to this period.
      </div>

      <div v-else class="card overflow-hidden">
        <div
          class="hidden grid-cols-[110px_1fr_130px_150px_100px] gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-semibold text-ink-500 md:grid"
        >
          <div>Date</div>
          <div>Expense</div>
          <div>Paid by</div>
          <div class="text-right">Amount</div>
          <div />
        </div>
        <div class="divide-y">
          <div
            v-for="expense in expenses"
            :key="expense.id"
            class="grid gap-3 px-5 py-4 md:grid-cols-[110px_1fr_130px_150px_100px] md:items-center md:gap-4"
          >
            <p class="text-sm text-ink-500">
              {{ formatDate(expense.expenseDate) || 'No date' }}
            </p>
            <div>
              <p class="font-medium">{{ expense.description }}</p>
              <p v-if="expense.category" class="mt-0.5 text-xs text-ink-500">
                {{ expense.category }}
              </p>
            </div>
            <p class="text-sm text-ink-700">{{ expense.payerName }}</p>
            <p class="text-lg font-semibold md:text-right">{{ formatYen(expense.amount) }}</p>
            <div v-if="!isClosed" class="flex gap-3 text-sm md:justify-end">
              <button
                class="font-medium text-mint-700 hover:text-mint-600"
                type="button"
                @click="editExpense(expense)"
              >
                Edit
              </button>
              <button
                class="font-medium text-red-600 hover:text-red-500"
                type="button"
                @click="removeExpense(expense)"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mb-8">
      <div class="mb-3">
        <p class="eyebrow">Owed amounts</p>
        <h2 class="mt-1 text-xl font-semibold">Money owed directly</h2>
      </div>

      <form
        v-if="!isClosed"
        id="owed-amount-form"
        class="card mb-4 p-5 sm:p-6"
        @submit.prevent="saveOwedAmount"
      >
        <div class="mb-5 flex items-center justify-between">
          <div>
            <p class="eyebrow">
              {{ editingOwedAmountId ? 'Editing owed amount' : 'New owed amount' }}
            </p>
            <h3 class="mt-1 text-lg font-semibold">
              {{ editingOwedAmountId ? 'Update owed amount' : 'Add money owed' }}
            </h3>
          </div>
          <button
            v-if="editingOwedAmountId"
            class="text-sm text-ink-500 hover:text-ink-950"
            type="button"
            @click="clearOwedAmountForm"
          >
            Cancel
          </button>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div class="sm:col-span-2">
            <label class="label" for="owedDescription">Description</label>
            <input
              id="owedDescription"
              v-model="owedAmountForm.description"
              class="input"
              placeholder="Flight reimbursement, gift split…"
              maxlength="160"
              required
            />
          </div>
          <div>
            <label class="label" for="owedAmount">Amount</label>
            <div class="relative">
              <span class="pointer-events-none absolute top-2.5 left-3.5 text-sm text-ink-500"
                >¥</span
              >
              <input
                id="owedAmount"
                v-model="owedAmountForm.amount"
                class="input !pl-8"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                placeholder="0"
                required
              />
            </div>
          </div>
          <div>
            <label class="label" for="owedFrom">Owed by</label>
            <select id="owedFrom" v-model="owedAmountForm.fromUserId" class="input" required>
              <option v-for="member in members" :key="member.id" :value="String(member.id)">
                {{ member.name }}
              </option>
            </select>
          </div>
          <div>
            <label class="label" for="owedTo">Owed to</label>
            <select id="owedTo" v-model="owedAmountForm.toUserId" class="input" required>
              <option v-for="member in members" :key="member.id" :value="String(member.id)">
                {{ member.name }}
              </option>
            </select>
          </div>
          <div class="sm:col-span-2 lg:col-span-3">
            <label class="label" for="owedNotes">Notes</label>
            <input
              id="owedNotes"
              v-model="owedAmountForm.notes"
              class="input"
              placeholder="Optional details"
              maxlength="2000"
            />
          </div>
        </div>

        <div class="mt-5 flex justify-end">
          <button class="button-primary" type="submit" :disabled="saving">
            {{
              saving ? 'Saving…' : editingOwedAmountId ? 'Update owed amount' : 'Add owed amount'
            }}
          </button>
        </div>
      </form>

      <div
        v-if="!owedAmounts.length"
        class="card border-dashed p-9 text-center text-sm text-ink-500"
      >
        No direct owed amounts have been added to this period.
      </div>

      <div v-else class="card overflow-hidden">
        <div
          class="hidden gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-semibold text-ink-500 md:grid"
          :class="
            isClosed
              ? 'md:grid-cols-[1fr_150px_150px_120px]'
              : 'md:grid-cols-[1fr_150px_150px_120px_100px]'
          "
        >
          <div>Description</div>
          <div>Owed by</div>
          <div>Owed to</div>
          <div class="text-right">Amount</div>
          <div v-if="!isClosed" />
        </div>
        <div class="divide-y">
          <div
            v-for="owedAmount in owedAmounts"
            :key="owedAmount.id"
            class="grid gap-3 px-5 py-4 md:items-center md:gap-4"
            :class="
              isClosed
                ? 'md:grid-cols-[1fr_150px_150px_120px]'
                : 'md:grid-cols-[1fr_150px_150px_120px_100px]'
            "
          >
            <div>
              <p class="font-medium">{{ owedAmount.description }}</p>
              <p v-if="owedAmount.notes" class="mt-0.5 text-xs text-ink-500">
                {{ owedAmount.notes }}
              </p>
            </div>
            <p class="text-sm text-ink-700">{{ owedAmount.fromName }}</p>
            <p class="text-sm text-ink-700">{{ owedAmount.toName }}</p>
            <p class="text-lg font-semibold md:text-right">{{ formatYen(owedAmount.amount) }}</p>
            <div v-if="!isClosed" class="flex gap-3 text-sm md:justify-end">
              <button
                class="font-medium text-mint-700 hover:text-mint-600"
                type="button"
                @click="editOwedAmount(owedAmount)"
              >
                Edit
              </button>
              <button
                class="font-medium text-red-600 hover:text-red-500"
                type="button"
                @click="removeOwedAmount(owedAmount)"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!isClosed" class="mb-4 flex justify-end">
      <button class="button-secondary" type="button" @click="showBulkImport = !showBulkImport">
        {{ showBulkImport ? 'Hide CSV import' : 'Import CSV' }}
      </button>
    </div>

    <BulkExpenseImport
      v-if="showBulkImport && !isClosed"
      :period-id="period.id"
      :start-date="period.startDate"
      :end-date="period.endDate"
      :members="members"
      :existing-expenses="expenses"
      @imported="importComplete"
    />

    <section v-if="imports.length" class="card mb-8 overflow-hidden">
      <div class="border-b bg-slate-50/70 px-5 py-4">
        <p class="eyebrow">Import history</p>
        <h2 class="mt-1 text-lg font-semibold">CSV batches</h2>
      </div>
      <div class="divide-y">
        <div
          v-for="batch in imports"
          :key="batch.id"
          class="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"
        >
          <div>
            <p class="font-medium">{{ batch.sourceName }}</p>
            <p class="mt-1 text-xs text-ink-500">
              {{ batch.rowCount }} expenses · {{ formatYen(batch.totalAmount) }} ·
              {{ batch.importedBy }} · {{ formatDateTime(batch.importedAt) }}
            </p>
          </div>
          <button
            v-if="!isClosed"
            class="text-left text-sm font-medium text-red-600 hover:text-red-500"
            type="button"
            @click="undoImport(batch)"
          >
            Undo import
          </button>
        </div>
      </div>
    </section>

    <div class="mb-8 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <div
        class="overflow-hidden rounded-2xl bg-ink-950 p-6 text-white shadow-lg shadow-slate-900/10 sm:p-7"
      >
        <p class="text-xs font-semibold tracking-[0.13em] text-mint-100 uppercase">Settlement</p>
        <template v-if="summary.ready && summary.settlement">
          <p class="mt-4 text-sm text-slate-300">{{ summary.settlement.fromName }} pays</p>
          <p class="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
            {{ formatYen(summary.settlement.amount) }}
          </p>
          <p class="mt-3 text-sm text-slate-300">
            to <span class="font-semibold text-white">{{ summary.settlement.toName }}</span>
          </p>
        </template>
        <template v-else-if="summary.ready">
          <p class="mt-4 text-3xl font-semibold tracking-tight">Everything is balanced</p>
          <p class="mt-3 text-sm text-slate-300">No payment is currently needed.</p>
        </template>
        <template v-else>
          <p class="mt-4 text-2xl font-semibold">Income needed</p>
          <p class="mt-3 text-sm text-slate-300">{{ summary.reason }}</p>
        </template>
        <div class="mt-8 grid gap-4 border-t border-white/15 pt-5 sm:grid-cols-3">
          <div>
            <p class="text-xs text-slate-400">Total income</p>
            <p class="mt-1 font-semibold">{{ formatYen(summary.totalIncome) }}</p>
          </div>
          <div>
            <p class="text-xs text-slate-400">Total expenses</p>
            <p class="mt-1 font-semibold">{{ formatYen(summary.totalExpenses) }}</p>
          </div>
          <div>
            <p class="text-xs text-slate-400">Owed amounts</p>
            <p class="mt-1 font-semibold">{{ formatYen(summary.totalOwedAdjustments) }}</p>
          </div>
        </div>
      </div>

      <div class="card p-5 sm:p-6">
        <p class="eyebrow">How it is split</p>
        <div class="mt-4 divide-y">
          <div v-for="member in summary.members" :key="member.id" class="py-3 first:pt-0 last:pb-0">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="font-medium">{{ member.name }}</p>
                <p class="mt-0.5 text-xs text-ink-500">
                  {{ member.percentage.toFixed(2) }}% of income
                </p>
              </div>
              <div class="text-right">
                <p class="font-semibold">{{ formatYen(member.fairShare) }}</p>
                <p class="mt-0.5 text-xs text-ink-500">fair share</p>
              </div>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                class="h-full rounded-full bg-mint-500"
                :style="{ width: `${member.percentage}%` }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mb-8">
      <div class="mb-3">
        <p class="eyebrow">Income</p>
        <h2 class="mt-1 text-xl font-semibold">Household income</h2>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <form
          v-for="member in members"
          :key="member.id"
          class="card p-5"
          @submit.prevent="saveIncome(member)"
        >
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="font-semibold">{{ member.name }}</p>
              <p class="mt-0.5 text-xs text-ink-500">
                {{
                  summary.members
                    .find((item) => String(item.id) === String(member.id))
                    ?.percentage.toFixed(2)
                }}% of total income
              </p>
            </div>
            <div class="flex max-w-52 items-center gap-2">
              <span class="text-ink-500">¥</span>
              <input
                v-model="incomeDraft[member.id]"
                class="input text-right"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                :disabled="isClosed"
                required
                aria-label="Income in yen"
              />
              <button
                v-if="!isClosed"
                class="button-primary !px-3"
                type="submit"
                :disabled="saving"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <div class="mb-8">
      <div class="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p class="eyebrow">Recurring</p>
          <h2 class="mt-1 text-xl font-semibold">Recurring expenses</h2>
          <p class="mt-1 text-sm text-ink-500">
            Save a template once and it will be copied into each new period automatically.
          </p>
        </div>
        <button class="button-secondary" type="button" @click="toggleRecurringForm">
          {{
            showRecurringForm || editingRecurringExpenseId ? 'Hide form' : 'Add recurring expense'
          }}
        </button>
      </div>

      <div class="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <form
          v-if="showRecurringForm || editingRecurringExpenseId"
          id="recurring-expense-form"
          class="card p-5 sm:p-6"
          @submit.prevent="saveRecurringExpense"
        >
          <div class="mb-5 flex items-center justify-between gap-4">
            <div>
              <p class="eyebrow">
                {{ editingRecurringExpenseId ? 'Editing template' : 'New template' }}
              </p>
              <h3 class="mt-1 text-lg font-semibold">
                {{
                  editingRecurringExpenseId ? 'Update recurring expense' : 'Add recurring expense'
                }}
              </h3>
            </div>
            <button
              v-if="editingRecurringExpenseId"
              class="text-sm text-ink-500 hover:text-ink-950"
              type="button"
              @click="closeRecurringForm"
            >
              Cancel
            </button>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="sm:col-span-1 lg:col-span-2">
              <label class="label" for="recurringDescription">Description</label>
              <input
                id="recurringDescription"
                v-model="recurringExpenseForm.description"
                class="input"
                placeholder="Rent, gym, insurance…"
                maxlength="160"
                required
              />
            </div>
            <div>
              <label class="label" for="recurringAmount">Amount</label>
              <div class="relative">
                <span class="pointer-events-none absolute top-2.5 left-3.5 text-sm text-ink-500"
                  >¥</span
                >
                <input
                  id="recurringAmount"
                  v-model="recurringExpenseForm.amount"
                  class="input !pl-8"
                  type="number"
                  min="1"
                  step="1"
                  inputmode="numeric"
                  placeholder="0"
                  required
                />
              </div>
            </div>
            <div>
              <label class="label" for="recurringPaidBy">Paid by</label>
              <select
                id="recurringPaidBy"
                v-model="recurringExpenseForm.paidBy"
                class="input"
                required
              >
                <option v-for="member in members" :key="member.id" :value="String(member.id)">
                  {{ member.name }}
                </option>
              </select>
            </div>
            <div>
              <label class="label" for="recurringCategory">Category</label>
              <input
                id="recurringCategory"
                v-model="recurringExpenseForm.category"
                class="input"
                placeholder="Optional"
                maxlength="80"
              />
            </div>
            <div class="sm:col-span-2">
              <label class="label" for="recurringNotes">Notes</label>
              <input
                id="recurringNotes"
                v-model="recurringExpenseForm.notes"
                class="input"
                placeholder="Optional details"
                maxlength="2000"
              />
            </div>
            <label
              class="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-ink-700 sm:col-span-2 lg:col-span-4"
            >
              <input
                v-model="recurringExpenseForm.applyToCurrentPeriod"
                type="checkbox"
                class="size-4 accent-mint-600"
                :disabled="isClosed"
              />
              Also add this to the current period now
            </label>
          </div>

          <div class="mt-5 flex justify-end gap-3">
            <button
              v-if="!editingRecurringExpenseId"
              class="button-secondary"
              type="button"
              @click="closeRecurringForm"
            >
              Cancel
            </button>
            <button class="button-primary" type="submit" :disabled="saving">
              {{
                saving ? 'Saving…' : editingRecurringExpenseId ? 'Update template' : 'Save template'
              }}
            </button>
          </div>
        </form>

        <div class="card overflow-hidden">
          <div class="border-b bg-slate-50/70 px-5 py-4">
            <p class="eyebrow">Saved templates</p>
            <h3 class="mt-1 text-lg font-semibold">Applied to future periods</h3>
          </div>
          <div v-if="recurringExpenses.length" class="divide-y">
            <div
              v-for="expense in recurringExpenses"
              :key="expense.id"
              class="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"
            >
              <div>
                <p class="font-medium">{{ expense.description }}</p>
                <p class="mt-1 text-xs text-ink-500">
                  {{ expense.payerName }} · {{ formatYen(expense.amount) }}
                  <span v-if="expense.category"> · {{ expense.category }}</span>
                </p>
                <p v-if="expense.notes" class="mt-1 text-xs text-ink-500">
                  {{ expense.notes }}
                </p>
              </div>
              <div class="flex gap-3 text-sm">
                <button
                  class="font-medium text-mint-700 hover:text-mint-600"
                  type="button"
                  @click="editRecurringExpense(expense)"
                >
                  Edit
                </button>
                <button
                  class="font-medium text-red-600 hover:text-red-500"
                  type="button"
                  @click="removeRecurringExpense(expense)"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
          <div v-else class="px-5 py-8 text-center text-sm text-ink-500">
            No recurring expenses yet.
          </div>
        </div>
      </div>
    </div>

    <div class="mt-10 flex justify-end border-t border-slate-200 pt-6">
      <button class="button-secondary" type="button" :disabled="saving" @click="toggleStatus">
        {{ isClosed ? 'Reopen period' : 'Close period' }}
      </button>
    </div>
  </section>

  <div
    v-else-if="error"
    role="alert"
    class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
  >
    {{ error }}
  </div>
</template>
