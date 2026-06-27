<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError, api } from '../api'
import { formatDate, formatYen, todayIso } from '../format'

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
  expenseDate: string
  description: string
  category: string | null
  amount: string
  paidBy: number
  payerName: string
  notes: string | null
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
  summary: Summary
}

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const period = ref<Period | null>(null)
const members = ref<Member[]>([])
const expenses = ref<Expense[]>([])
const summary = ref<Summary>({
  ready: false,
  reason: 'Enter household income to calculate the split.',
  totalIncome: '0',
  totalExpenses: '0',
  members: [],
  settlement: null,
})
const incomeDraft = reactive<Record<number, string>>({})
const editingExpenseId = ref<number | null>(null)

const expenseForm = reactive({
  expenseDate: todayIso(),
  description: '',
  category: '',
  amount: '',
  paidBy: '',
  notes: '',
})

const isClosed = computed(() => period.value?.status === 'closed')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api<PeriodResponse>(`/periods/${route.params.id}`)
    period.value = data.period
    members.value = data.members
    expenses.value = data.expenses
    summary.value = data.summary
    for (const member of data.members) incomeDraft[member.id] = String(member.income)
    const firstMember = data.members[0]
    if (!expenseForm.paidBy && firstMember) {
      expenseForm.paidBy = String(firstMember.id)
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
    error.value =
      requestError instanceof ApiError ? requestError.message : 'Unable to save income.'
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

function editExpense(expense: Expense) {
  editingExpenseId.value = expense.id
  expenseForm.expenseDate = expense.expenseDate
  expenseForm.description = expense.description
  expenseForm.category = expense.category || ''
  expenseForm.amount = String(expense.amount)
  expenseForm.paidBy = String(expense.paidBy)
  expenseForm.notes = expense.notes || ''
  document.querySelector('#expense-form')?.scrollIntoView({ behavior: 'smooth' })
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

async function toggleStatus() {
  if (!period.value) return
  const nextStatus = isClosed.value ? 'open' : 'closed'
  if (
    nextStatus === 'closed' &&
    !window.confirm('Close this period? Income and expenses will become read-only.')
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
  <div v-if="loading" class="card p-10 text-center text-sm text-ink-500">
    Loading calculation…
  </div>

  <section v-else-if="period">
    <RouterLink
      to="/"
      class="mb-6 inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-mint-700"
    >
      <span>←</span> All periods
    </RouterLink>

    <div class="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
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
      <button class="button-secondary" type="button" :disabled="saving" @click="toggleStatus">
        {{ isClosed ? 'Reopen period' : 'Close period' }}
      </button>
    </div>

    <div
      v-if="error"
      role="alert"
      class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {{ error }}
    </div>

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
        <div class="mt-8 grid grid-cols-2 gap-4 border-t border-white/15 pt-5">
          <div>
            <p class="text-xs text-slate-400">Total income</p>
            <p class="mt-1 font-semibold">{{ formatYen(summary.totalIncome) }}</p>
          </div>
          <div>
            <p class="text-xs text-slate-400">Total expenses</p>
            <p class="mt-1 font-semibold">{{ formatYen(summary.totalExpenses) }}</p>
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
                <p class="mt-0.5 text-xs text-ink-500">{{ member.percentage.toFixed(2) }}% of income</p>
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
                {{ summary.members.find((item) => String(item.id) === String(member.id))?.percentage.toFixed(2) }}%
                of total income
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
            <span class="pointer-events-none absolute top-2.5 left-3.5 text-sm text-ink-500">¥</span>
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

    <div>
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
        <div class="hidden grid-cols-[110px_1fr_130px_150px_100px] gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-semibold text-ink-500 md:grid">
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
            <p class="text-sm text-ink-500">{{ formatDate(expense.expenseDate) }}</p>
            <div>
              <p class="font-medium">{{ expense.description }}</p>
              <p v-if="expense.category" class="mt-0.5 text-xs text-ink-500">{{ expense.category }}</p>
            </div>
            <p class="text-sm text-ink-700">{{ expense.payerName }}</p>
            <p class="text-lg font-semibold md:text-right">{{ formatYen(expense.amount) }}</p>
            <div v-if="!isClosed" class="flex gap-3 text-sm md:justify-end">
              <button class="font-medium text-mint-700 hover:text-mint-600" type="button" @click="editExpense(expense)">
                Edit
              </button>
              <button class="font-medium text-red-600 hover:text-red-500" type="button" @click="removeExpense(expense)">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
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
