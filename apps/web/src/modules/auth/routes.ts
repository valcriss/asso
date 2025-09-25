import type { RouteRecordRaw } from 'vue-router';

export const authRoutes: RouteRecordRaw[] = [
  {
    path: '/connexion',
    name: 'auth.login',
    component: () => import('./views/LoginView.vue'),
    meta: {
      layout: 'auth',
      public: true,
      title: 'Connexion',
    },
  },
  {
    path: '/mot-de-passe-oublie',
    name: 'auth.forgot',
    component: () => import('./views/ForgotPasswordView.vue'),
    meta: {
      layout: 'auth',
      public: true,
      title: 'Mot de passe oublié',
    },
  },
  {
    path: '/reinitialisation-mot-de-passe',
    name: 'auth.reset',
    component: () => import('./views/ResetPasswordView.vue'),
    props: (route) => ({ token: route.query.token as string | undefined }),
    meta: {
      layout: 'auth',
      public: true,
      title: 'Réinitialiser le mot de passe',
    },
  },
];
