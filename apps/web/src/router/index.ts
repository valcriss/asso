import { createRouter, createWebHistory } from 'vue-router';

import { accountingRoutes } from '@/modules/accounting/routes';
import { dashboardRoutes } from '@/modules/dashboard/routes';
import { grantsRoutes } from '@/modules/grants/routes';
import { membersRoutes } from '@/modules/members/routes';

const routes = [...dashboardRoutes, ...accountingRoutes, ...membersRoutes, ...grantsRoutes];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

export default router;
