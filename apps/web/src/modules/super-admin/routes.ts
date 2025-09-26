import type { RouteRecordRaw } from 'vue-router';

export const superAdminRoutes: RouteRecordRaw[] = [
  {
    path: '/supervision',
    name: 'superAdmin.panel',
    component: () => import('./views/SuperAdminPanel.vue'),
    meta: {
      layout: 'main',
      requiresAuth: true,
      requiresSuperAdmin: true,
      title: 'Supervision',
    },
  },
];
