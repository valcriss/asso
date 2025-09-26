import type { RouteRecordRaw } from 'vue-router';

export const settingsRoutes: RouteRecordRaw[] = [
  {
    path: '/parametres',
    name: 'settings.preferences',
    component: () => import('./views/SettingsPreferencesView.vue'),
    meta: {
      layout: 'main',
      requiresAuth: true,
      requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY', 'VIEWER'],
      title: 'Paramètres',
    },
  },
];
