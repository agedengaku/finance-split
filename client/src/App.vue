<script setup lang="ts">
import { useRouter } from 'vue-router'
import { auth, signOut } from './auth'

const router = useRouter()

async function logout() {
  await signOut()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div v-if="auth.user" class="min-h-screen">
    <header class="border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <RouterLink to="/" class="group flex items-center gap-3">
          <span
            class="grid size-9 place-items-center rounded-xl bg-mint-600 text-base font-bold text-white shadow-sm shadow-mint-600/20"
          >
            F
          </span>
          <div>
            <div class="font-semibold tracking-tight text-ink-950">FairShare</div>
            <div class="hidden text-xs text-ink-500 sm:block">{{ auth.household?.name }}</div>
          </div>
        </RouterLink>

        <div class="flex items-center gap-3">
          <span class="hidden text-sm text-ink-700 sm:block">{{ auth.user.displayName }}</span>
          <button class="button-secondary !px-3 !py-2" type="button" @click="logout">
            Sign out
          </button>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <RouterView />
    </main>
  </div>
  <RouterView v-else />
</template>
