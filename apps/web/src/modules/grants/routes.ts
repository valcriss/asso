import type { RouteRecordRaw } from 'vue-router';

export const grantsRoutes: RouteRecordRaw[] = [
  {
    path: '/subventions',
    name: 'grants.list',
    component: () => import('./views/GrantsList.vue'),
    meta: {
      layout: 'main',
      requiresAuth: true,
      requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY'],
      title: 'Subventions',
    },
  },
];
