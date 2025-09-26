import type { RouteRecordRaw } from 'vue-router';

export const projectsRoutes: RouteRecordRaw[] = [
  {
    path: '/projets',
    name: 'projects.list',
    component: () => import('./views/ProjectsList.vue'),
    meta: {
      layout: 'main',
      requiresAuth: true,
      requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY', 'VIEWER'],
      title: 'Projets',
    },
  },
];
