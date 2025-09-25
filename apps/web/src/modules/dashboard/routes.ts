import type { RouteRecordRaw } from 'vue-router';

export const dashboardRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'dashboard.home',
    component: () => import('./views/DashboardHome.vue'),
    meta: {
      layout: 'main',
      title: 'Tableau de bord',
    },
  },
];
