import type { RouteRecordRaw } from 'vue-router';

export const legalRoutes: RouteRecordRaw[] = [
  {
    path: '/conditions-generales-utilisation',
    alias: ['/terms-of-service'],
    name: 'legal.terms',
    component: () => import('./views/TermsView.vue'),
    meta: {
      layout: 'public',
      public: true,
      title: 'Conditions Générales d\'Utilisation',
    },
  },
  {
    path: '/politique-de-confidentialite',
    alias: ['/privacy-policy'],
    name: 'legal.privacy',
    component: () => import('./views/PrivacyView.vue'),
    meta: {
      layout: 'public',
      public: true,
      title: 'Politique de confidentialité',
    },
  },
  {
    path: '/dpa',
    alias: ['/data-processing-agreement'],
    name: 'legal.dpa',
    component: () => import('./views/DpaView.vue'),
    meta: {
      layout: 'public',
      public: true,
      title: 'Data Processing Agreement',
    },
  },
];
