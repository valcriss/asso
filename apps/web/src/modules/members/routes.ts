import type { RouteRecordRaw } from 'vue-router';

export const membersRoutes: RouteRecordRaw[] = [
  {
    path: '/membres',
    name: 'members.list',
    component: () => import('./views/MembersList.vue'),
    meta: {
      layout: 'main',
      requiresAuth: true,
      requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY'],
      title: 'Membres',
    },
  },
];
