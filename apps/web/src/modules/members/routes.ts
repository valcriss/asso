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
  {
    path: '/membres/statuts-cotisations',
    name: 'members.contributions',
    component: () => import('./views/ContributionsStatus.vue'),
    meta: {
      layout: 'main',
      requiresAuth: true,
      requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY'],
      title: 'Statut des cotisations',
    },
  },
  {
    path: '/membres/:memberId',
    name: 'members.detail',
    component: () => import('./views/MemberDetail.vue'),
    props: true,
    meta: {
      layout: 'main',
      requiresAuth: true,
      requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY'],
      title: 'Fiche membre',
    },
  },
  {
    path: '/portail/membre',
    name: 'members.selfService',
    component: () => import('./views/MemberSelfService.vue'),
    meta: {
      layout: 'main',
      requiresAuth: true,
      requiredRoles: ['ADMIN', 'TREASURER', 'SECRETARY', 'VIEWER'],
      title: 'Portail adhérent',
    },
  },
];
