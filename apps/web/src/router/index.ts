import { createRouter, createWebHistory, type RouterHistory } from 'vue-router';

import { accountingRoutes } from '@/modules/accounting/routes';
import { authRoutes } from '@/modules/auth/routes';
import { dashboardRoutes } from '@/modules/dashboard/routes';
import { grantsRoutes } from '@/modules/grants/routes';
import { membersRoutes } from '@/modules/members/routes';
import { projectsRoutes } from '@/modules/projects/routes';
import { superAdminRoutes } from '@/modules/super-admin/routes';
import { useAuthStore, type UserRole } from '@/store';

const routes = [
  ...authRoutes,
  ...dashboardRoutes,
  ...accountingRoutes,
  ...membersRoutes,
  ...grantsRoutes,
  ...projectsRoutes,
  ...superAdminRoutes,
];

export function createAppRouter(history: RouterHistory = createWebHistory(import.meta.env.BASE_URL)) {
  const router = createRouter({
    history,
    routes,
    scrollBehavior() {
      return { top: 0 };
    },
  });

  router.beforeEach(async (to) => {
    const authStore = useAuthStore();

    if (!authStore.isInitialized) {
      await authStore.initializeFromStorage();
    }

    if (to.meta.public) {
      return true;
    }

    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
      const redirectQuery = to.fullPath && to.fullPath !== '/connexion' ? { redirect: to.fullPath } : undefined;
      return redirectQuery ? { name: 'auth.login', query: redirectQuery } : { name: 'auth.login' };
    }

    const requiresSuperAdmin = Boolean(to.meta.requiresSuperAdmin);
    if (to.meta.requiresAuth && requiresSuperAdmin && !authStore.isSuperAdmin) {
      return { name: 'dashboard.home' };
    }

    const requiredRoles = (to.meta.requiredRoles as UserRole[] | undefined) ?? [];
    if (to.meta.requiresAuth && requiredRoles.length && !authStore.hasAnyRole(requiredRoles)) {
      return { name: 'dashboard.home' };
    }

    return true;
  });

  return router;
}

const router = createAppRouter();

export default router;
