import type { RouteRecordRaw } from 'vue-router';

export const accountingRoutes: RouteRecordRaw[] = [
  {
    path: '/comptabilite',
    name: 'accounting.overview',
    component: () => import('./views/AccountingOverview.vue'),
    meta: {
      layout: 'main',
      requiresAuth: true,
      requiredRoles: ['ADMIN', 'TREASURER'],
      title: 'Comptabilité',
    },
  },
  {
    path: '/comptabilite/ecritures/nouvelle',
    name: 'accounting.entries.create',
    component: () => import('./views/EntryCreateView.vue'),
    meta: {
      layout: 'main',
      requiresAuth: true,
      requiredRoles: ['ADMIN', 'TREASURER'],
      title: 'Nouvelle écriture',
    },
  },
  {
    path: '/comptabilite/journal',
    name: 'accounting.reports.journal',
    component: () => import('./views/JournalReportView.vue'),
    meta: {
      layout: 'main',
      requiresAuth: true,
      requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY', 'VIEWER'],
      title: 'Journal comptable',
    },
  },
  {
    path: '/comptabilite/grand-livre',
    name: 'accounting.reports.ledger',
    component: () => import('./views/LedgerReportView.vue'),
    meta: {
      layout: 'main',
      requiresAuth: true,
      requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY', 'VIEWER'],
      title: 'Grand livre',
    },
  },
  {
    path: '/comptabilite/balance',
    name: 'accounting.reports.balance',
    component: () => import('./views/TrialBalanceView.vue'),
    meta: {
      layout: 'main',
      requiresAuth: true,
      requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY', 'VIEWER'],
      title: 'Balance comptable',
    },
  },
  {
    path: '/comptabilite/import-ofx',
    name: 'accounting.bank.ofx-import',
    component: () => import('./views/OfxImportView.vue'),
    meta: {
      layout: 'main',
      requiresAuth: true,
      requiredRoles: ['ADMIN', 'TREASURER'],
      title: 'Import OFX',
    },
  },
];
