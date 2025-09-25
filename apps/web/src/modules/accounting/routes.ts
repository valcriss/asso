import type { RouteRecordRaw } from 'vue-router';

export const accountingRoutes: RouteRecordRaw[] = [
  {
    path: '/comptabilite',
    name: 'accounting.overview',
    component: () => import('./views/AccountingOverview.vue'),
    meta: {
      layout: 'main',
      title: 'Comptabilité',
    },
  },
];
