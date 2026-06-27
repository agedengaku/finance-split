import { reactive } from 'vue'
import { ApiError, api } from './api'

export interface User {
  id: number
  email: string
  displayName: string
}

export interface HouseholdMember {
  id: number
  displayName: string
  role: 'owner' | 'member'
}

export interface Household {
  id: number
  name: string
  currency: 'JPY'
  role: 'owner' | 'member'
  members: HouseholdMember[]
}

interface BootstrapResponse {
  user: User
  household: Household
}

interface AuthState {
  user: User | null
  household: Household | null
  ready: boolean
}

export const auth = reactive<AuthState>({
  user: null,
  household: null,
  ready: false,
})

export async function loadSession({ force = false }: { force?: boolean } = {}) {
  if (auth.ready && !force) return
  try {
    const data = await api<BootstrapResponse>('/bootstrap')
    auth.user = data.user
    auth.household = data.household
  } catch (error: unknown) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error
    auth.user = null
    auth.household = null
  } finally {
    auth.ready = true
  }
}

export async function signIn(credentials: { email: string; password: string }) {
  await api('/auth/login', { method: 'POST', body: credentials })
  await loadSession({ force: true })
}

export async function signOut() {
  await api('/auth/logout', { method: 'POST', body: {} })
  auth.user = null
  auth.household = null
  auth.ready = true
}
