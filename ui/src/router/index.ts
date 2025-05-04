import { createRouter, createWebHistory } from 'vue-router'

// Routes principales
import God from '../pages/God.vue'
import Train from '../pages/Train.vue'
import Account from '../pages/Account.vue'
import Checkout from '../pages/Checkout.vue'
import Landing from '../pages/Landing.vue'
import Admin from '../pages/Admin.vue'
import StrategyLab from '../pages/StrategyLab.vue'
import NotFound from '../pages/NotFound.vue'

const routes = [
  { path: '/', redirect: '/landing' },
  { path: '/god', component: God },
  { path: '/train', component: Train },
  { path: '/account', component: Account },
  { path: '/checkout', component: Checkout },
  { path: '/landing', component: Landing },
  { path: '/admin', component: Admin },
  { path: '/strategies', component: StrategyLab },
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFound }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router