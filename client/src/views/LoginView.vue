<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { signIn } from '../auth'
import { ApiError } from '../api'

const route = useRoute()
const router = useRouter()
const form = reactive({ email: '', password: '' })
const error = ref('')
const submitting = ref(false)

async function submit() {
  error.value = ''
  submitting.value = true
  try {
    await signIn(form)
    await router.push(String(route.query.redirect || '/'))
  } catch (requestError: unknown) {
    error.value = requestError instanceof ApiError ? requestError.message : 'Unable to sign in.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="grid min-h-screen place-items-center px-4 py-12">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <div
          class="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-mint-600 text-xl font-bold text-white shadow-lg shadow-mint-600/20"
        >
          F
        </div>
        <h1 class="text-3xl font-semibold tracking-tight">Welcome to FairShare</h1>
        <p class="mt-2 text-sm text-ink-500">Sign in to manage your household finances.</p>
      </div>

      <form class="card p-6 sm:p-8" @submit.prevent="submit">
        <div
          v-if="error"
          role="alert"
          class="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {{ error }}
        </div>
        <div class="space-y-5">
          <div>
            <label class="label" for="email">Email address</label>
            <input
              id="email"
              v-model="form.email"
              class="input"
              type="email"
              autocomplete="username"
              required
              autofocus
            />
          </div>
          <div>
            <label class="label" for="password">Password</label>
            <input
              id="password"
              v-model="form.password"
              class="input"
              type="password"
              autocomplete="current-password"
              required
            />
          </div>
          <button class="button-primary w-full" type="submit" :disabled="submitting">
            {{ submitting ? 'Signing in…' : 'Sign in' }}
          </button>
        </div>
      </form>
      <p class="mt-5 text-center text-xs text-ink-500">This is a private household application.</p>
    </div>
  </main>
</template>
