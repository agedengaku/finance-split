<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError, api } from '../api'
import { formatDate, formatYen } from '../format'

interface TrendPeriod {
  id: number
  label: string
  startDate: string
  endDate: string
  status: 'open' | 'closed'
  totalIncome: string
  totalExpenses: string
}

interface CategoryTotal {
  category: string | null
  totalExpenses: string
  expenseCount: number
}

interface YearlyReport {
  year: number
  availableYears: number[]
  periods: TrendPeriod[]
  categories: CategoryTotal[]
}

const selectedYear = ref(new Date().getFullYear())
const availableYears = ref<number[]>([])
const periods = ref<TrendPeriod[]>([])
const categories = ref<CategoryTotal[]>([])
const loading = ref(true)
const error = ref('')

const chartWidth = 900
const chartHeight = 360
const padding = { top: 28, right: 28, bottom: 70, left: 92 }
const plotWidth = chartWidth - padding.left - padding.right
const plotHeight = chartHeight - padding.top - padding.bottom

const maximum = computed(() =>
  Math.max(
    0,
    ...periods.value.flatMap((period) => [
      Number(period.totalIncome),
      Number(period.totalExpenses),
    ]),
  ),
)

const axisMaximum = computed(() => {
  if (!maximum.value) return 100000
  const magnitude = 10 ** Math.floor(Math.log10(maximum.value))
  const normalized = maximum.value / magnitude
  const rounded = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return rounded * magnitude
})

const gridLines = computed(() =>
  Array.from({ length: 5 }, (_, index) => {
    const value = (axisMaximum.value * (4 - index)) / 4
    return {
      value,
      y: padding.top + (index * plotHeight) / 4,
    }
  }),
)

function xPosition(index: number): number {
  if (periods.value.length <= 1) return padding.left + plotWidth / 2
  return padding.left + (index * plotWidth) / (periods.value.length - 1)
}

function yPosition(value: string): number {
  return padding.top + plotHeight - (Number(value) / axisMaximum.value) * plotHeight
}

function linePoints(field: 'totalIncome' | 'totalExpenses'): string {
  return periods.value
    .map((period, index) => `${xPosition(index)},${yPosition(period[field])}`)
    .join(' ')
}

function shortYen(value: number): string {
  if (value >= 1000000) return `¥${Number((value / 1000000).toFixed(1))}m`
  if (value >= 1000) return `¥${Number((value / 1000).toFixed(0))}k`
  return `¥${value}`
}

function shortLabel(label: string): string {
  return label.length > 14 ? `${label.slice(0, 12)}…` : label
}

async function loadReport() {
  loading.value = true
  error.value = ''
  try {
    const data = await api<YearlyReport>(`/reports/yearly?year=${selectedYear.value}`)
    periods.value = data.periods
    categories.value = data.categories
    availableYears.value = data.availableYears
    if (
      !data.periods.length &&
      data.availableYears.length &&
      !data.availableYears.includes(selectedYear.value)
    ) {
      selectedYear.value = data.availableYears[0]!
    }
  } catch (requestError: unknown) {
    error.value =
      requestError instanceof ApiError ? requestError.message : 'Unable to load yearly trends.'
  } finally {
    loading.value = false
  }
}

const totalIncome = computed(() =>
  periods.value.reduce((total, period) => total + BigInt(period.totalIncome), 0n).toString(),
)
const totalExpenses = computed(() =>
  periods.value.reduce((total, period) => total + BigInt(period.totalExpenses), 0n).toString(),
)

watch(selectedYear, loadReport)
onMounted(loadReport)
</script>

<template>
  <section>
    <div class="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p class="eyebrow">Yearly report</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Income and expenses</h1>
        <p class="mt-2 text-sm text-ink-500">
          Compare household totals across each calculation period.
        </p>
      </div>
      <div class="w-full sm:w-40">
        <label class="label" for="trendYear">Year</label>
        <select id="trendYear" v-model.number="selectedYear" class="input">
          <option
            v-for="year in availableYears.length ? availableYears : [selectedYear]"
            :key="year"
            :value="year"
          >
            {{ year }}
          </option>
        </select>
      </div>
    </div>

    <div
      v-if="error"
      role="alert"
      class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {{ error }}
    </div>

    <div v-if="loading" class="card p-10 text-center text-sm text-ink-500">
      Loading trends…
    </div>

    <div v-else-if="!periods.length" class="card border-dashed p-10 text-center sm:p-14">
      <div class="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-mint-50 text-xl">
        ↗
      </div>
      <h2 class="text-lg font-semibold">No periods in {{ selectedYear }}</h2>
      <p class="mx-auto mt-2 max-w-sm text-sm text-ink-500">
        Periods appear here according to the year of their start date.
      </p>
    </div>

    <template v-else>
      <div class="mb-4 grid gap-4 sm:grid-cols-2">
        <div class="card p-5">
          <p class="text-xs font-semibold tracking-wide text-blue-700 uppercase">Year income</p>
          <p class="mt-2 text-2xl font-semibold">{{ formatYen(totalIncome) }}</p>
        </div>
        <div class="card p-5">
          <p class="text-xs font-semibold tracking-wide text-orange-700 uppercase">Year expenses</p>
          <p class="mt-2 text-2xl font-semibold">{{ formatYen(totalExpenses) }}</p>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <h2 class="font-semibold">{{ selectedYear }} period trend</h2>
          <div class="flex gap-5 text-xs font-medium text-ink-700">
            <span class="flex items-center gap-2">
              <span class="size-2.5 rounded-full bg-blue-600"></span>
              Income
            </span>
            <span class="flex items-center gap-2">
              <span class="size-2.5 rounded-full bg-orange-500"></span>
              Expenses
            </span>
          </div>
        </div>

        <div class="overflow-x-auto p-3 sm:p-5">
          <svg
            class="min-w-[720px]"
            :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
            role="img"
            :aria-label="`Income and expense trend for ${selectedYear}`"
          >
            <g v-for="line in gridLines" :key="line.value">
              <line
                :x1="padding.left"
                :x2="chartWidth - padding.right"
                :y1="line.y"
                :y2="line.y"
                stroke="#e2e8f0"
                stroke-width="1"
              />
              <text
                :x="padding.left - 14"
                :y="line.y + 4"
                text-anchor="end"
                class="fill-slate-500 text-[12px]"
              >
                {{ shortYen(line.value) }}
              </text>
            </g>

            <polyline
              v-if="periods.length > 1"
              :points="linePoints('totalIncome')"
              fill="none"
              stroke="#2563eb"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="3"
            />
            <polyline
              v-if="periods.length > 1"
              :points="linePoints('totalExpenses')"
              fill="none"
              stroke="#f97316"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="3"
            />

            <g v-for="(period, index) in periods" :key="period.id">
              <circle
                :cx="xPosition(index)"
                :cy="yPosition(period.totalIncome)"
                r="5"
                fill="#2563eb"
                stroke="white"
                stroke-width="2"
              >
                <title>{{ period.label }} income: {{ formatYen(period.totalIncome) }}</title>
              </circle>
              <circle
                :cx="xPosition(index)"
                :cy="yPosition(period.totalExpenses)"
                r="5"
                fill="#f97316"
                stroke="white"
                stroke-width="2"
              >
                <title>{{ period.label }} expenses: {{ formatYen(period.totalExpenses) }}</title>
              </circle>
              <text
                :x="xPosition(index)"
                :y="chartHeight - 32"
                text-anchor="middle"
                class="fill-slate-600 text-[11px]"
              >
                {{ shortLabel(period.label) }}
              </text>
            </g>
          </svg>
        </div>
      </div>

      <div class="card mt-6 overflow-hidden">
        <div class="grid grid-cols-[1fr_auto_auto] gap-3 border-b bg-slate-50 px-5 py-3 text-xs font-semibold text-ink-500 uppercase">
          <span>Period</span>
          <span class="text-right">Income</span>
          <span class="text-right">Expenses</span>
        </div>
        <RouterLink
          v-for="period in periods"
          :key="period.id"
          :to="{ name: 'period', params: { id: period.id } }"
          class="grid grid-cols-[1fr_auto_auto] gap-3 border-b px-5 py-4 text-sm transition last:border-b-0 hover:bg-slate-50"
        >
          <span>
            <span class="block font-medium">{{ period.label }}</span>
            <span class="mt-0.5 block text-xs text-ink-500">
              {{ formatDate(period.startDate) }} – {{ formatDate(period.endDate) }}
            </span>
          </span>
          <span class="min-w-24 text-right font-medium text-blue-700">
            {{ formatYen(period.totalIncome) }}
          </span>
          <span class="min-w-24 text-right font-medium text-orange-700">
            {{ formatYen(period.totalExpenses) }}
          </span>
        </RouterLink>
      </div>

      <div class="card mt-6 overflow-hidden">
        <div class="border-b px-5 py-4">
          <h2 class="font-semibold">Expenses by category</h2>
          <p class="mt-1 text-xs text-ink-500">
            Ranked by total spending for {{ selectedYear }}.
          </p>
        </div>
        <div v-if="categories.length" class="divide-y">
          <div
            v-for="(category, index) in categories"
            :key="category.category ?? 'uncategorized'"
            class="flex items-center gap-4 px-5 py-4"
          >
            <span
              class="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-ink-500"
            >
              {{ index + 1 }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">
                {{ category.category || 'Uncategorized' }}
              </p>
              <p class="mt-0.5 text-xs text-ink-500">
                {{ category.expenseCount }}
                {{ category.expenseCount === 1 ? 'expense' : 'expenses' }}
              </p>
            </div>
            <p class="shrink-0 font-semibold">{{ formatYen(category.totalExpenses) }}</p>
          </div>
        </div>
        <p v-else class="px-5 py-8 text-center text-sm text-ink-500">
          No expenses to rank for this year.
        </p>
      </div>
    </template>
  </section>
</template>
