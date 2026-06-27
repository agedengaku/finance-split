<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError, api } from '../api'
import { formatDate, formatYen } from '../format'

const router = useRouter()

interface Period {
  id: number
  label: string
  startDate: string
  endDate: string
  status: 'open' | 'closed'
  totalExpenses: string
  expenseCount: number
}

interface PeriodsResponse {
  periods: Period[]
}

interface CreatePeriodResponse {
  period: Period
}

const periods = ref<Period[]>([])
const loading = ref(true)
const showCreate = ref(false)
const submitting = ref(false)
const error = ref('')

const now = new Date()
const year = now.getFullYear()
const month = now.getMonth()
const form = reactive({
  label: new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(now),
  startDate: `${year}-${String(month + 1).padStart(2, '0')}-01`,
  endDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(
    new Date(year, month + 1, 0).getDate(),
  ).padStart(2, '0')}`,
})

const openPeriods = computed(() => periods.value.filter((period) => period.status === 'open'))
const closedPeriods = computed(() => periods.value.filter((period) => period.status === 'closed'))

async function load() {
  loading.value = true
  try {
    const data = await api<PeriodsResponse>('/periods')
    periods.value = data.periods
  } catch (requestError: unknown) {
    error.value =
      requestError instanceof ApiError ? requestError.message : 'Unable to load periods.'
  } finally {
    loading.value = false
  }
}

async function createPeriod() {
  error.value = ''
  submitting.value = true
  try {
    const data = await api<CreatePeriodResponse>('/periods', { method: 'POST', body: form })
    await router.push({ name: 'period', params: { id: data.period.id } })
  } catch (requestError: unknown) {
    error.value =
      requestError instanceof ApiError ? requestError.message : 'Unable to create the period.'
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <section>
    <div class="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p class="eyebrow">Household finances</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Calculation periods</h1>
        <p class="mt-2 text-sm text-ink-500">
          Track income, shared expenses, and what needs to be settled.
        </p>
      </div>
      <button class="button-primary" type="button" @click="showCreate = !showCreate">
        <span class="text-lg leading-none">+</span>
        New period
      </button>
    </div>

    <div
      v-if="error"
      role="alert"
      class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {{ error }}
    </div>

    <form v-if="showCreate" class="card mb-8 p-5 sm:p-6" @submit.prevent="createPeriod">
      <div class="mb-5 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Create a calculation period</h2>
        <button
          class="text-sm text-ink-500 hover:text-ink-950"
          type="button"
          @click="showCreate = false"
        >
          Cancel
        </button>
      </div>
      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <label class="label" for="label">Period name</label>
          <input id="label" v-model="form.label" class="input" required maxlength="100" />
        </div>
        <div>
          <label class="label" for="startDate">Start date</label>
          <input id="startDate" v-model="form.startDate" class="input" type="date" required />
        </div>
        <div>
          <label class="label" for="endDate">End date</label>
          <input id="endDate" v-model="form.endDate" class="input" type="date" required />
        </div>
      </div>
      <div class="mt-5 flex justify-end">
        <button class="button-primary" type="submit" :disabled="submitting">
          {{ submitting ? 'Creating…' : 'Create period' }}
        </button>
      </div>
    </form>

    <div v-if="loading" class="card p-10 text-center text-sm text-ink-500">Loading periods…</div>

    <div v-else-if="!periods.length" class="card border-dashed p-10 text-center sm:p-14">
      <div class="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-mint-50 text-2xl">
        ¥
      </div>
      <h2 class="text-lg font-semibold">No calculation periods yet</h2>
      <p class="mx-auto mt-2 max-w-sm text-sm text-ink-500">
        Create your first monthly or custom period to begin entering income and expenses.
      </p>
    </div>

    <template v-else>
      <div v-if="openPeriods.length" class="grid gap-4 md:grid-cols-2">
        <RouterLink
          v-for="period in openPeriods"
          :key="period.id"
          :to="{ name: 'period', params: { id: period.id } }"
          class="card group p-5 transition hover:-translate-y-0.5 hover:border-mint-500/50 hover:shadow-md"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <span
                class="mb-3 inline-flex rounded-full bg-mint-50 px-2.5 py-1 text-xs font-semibold text-mint-700"
              >
                Open
              </span>
              <h2 class="text-xl font-semibold tracking-tight group-hover:text-mint-700">
                {{ period.label }}
              </h2>
              <p class="mt-1 text-sm text-ink-500">
                {{ formatDate(period.startDate) }} – {{ formatDate(period.endDate) }}
              </p>
            </div>
            <span
              class="text-xl text-slate-300 transition group-hover:translate-x-1 group-hover:text-mint-600"
            >
              →
            </span>
          </div>
          <div class="mt-6 flex items-end justify-between border-t pt-4">
            <div>
              <p class="text-xs text-ink-500">Total expenses</p>
              <p class="mt-1 text-lg font-semibold">{{ formatYen(period.totalExpenses) }}</p>
            </div>
            <p class="text-xs text-ink-500">{{ period.expenseCount }} expenses</p>
          </div>
        </RouterLink>
      </div>

      <div v-if="closedPeriods.length" class="mt-10">
        <h2 class="mb-3 text-sm font-semibold text-ink-700">Closed periods</h2>
        <div class="card divide-y overflow-hidden">
          <RouterLink
            v-for="period in closedPeriods"
            :key="period.id"
            :to="{ name: 'period', params: { id: period.id } }"
            class="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50"
          >
            <div>
              <p class="font-medium">{{ period.label }}</p>
              <p class="mt-0.5 text-xs text-ink-500">
                {{ formatDate(period.startDate) }} – {{ formatDate(period.endDate) }}
              </p>
            </div>
            <div class="text-right">
              <p class="font-medium">{{ formatYen(period.totalExpenses) }}</p>
              <p class="text-xs text-ink-500">{{ period.expenseCount }} expenses</p>
            </div>
          </RouterLink>
        </div>
      </div>
    </template>
  </section>
</template>
