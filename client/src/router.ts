import { createRouter, createWebHistory } from 'vue-router'
import { auth, loadSession } from './auth'
import DashboardView from './views/DashboardView.vue'
import LoginView from './views/LoginView.vue'
import PeriodView from './views/PeriodView.vue'
import TrendsView from './views/TrendsView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/trends', name: 'trends', component: TrendsView },
    { path: '/periods/:id', name: 'period', component: PeriodView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  await loadSession()
  if (!to.meta.public && !auth.user) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.user) return { name: 'dashboard' }
})

export default router
