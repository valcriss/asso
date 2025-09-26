import { render } from '@testing-library/vue';

import DpaView from '../DpaView.vue';
import PrivacyView from '../PrivacyView.vue';
import TermsView from '../TermsView.vue';
import { createAppI18n } from '@/lib/i18n';

describe('TermsView', () => {
  it('renders key sections in French', () => {
    const i18n = createAppI18n('fr');
    const { container } = render(TermsView, {
      global: { plugins: [i18n] },
    });

    const headings = Array.from(container.querySelectorAll('h2')).map((element) => element.textContent?.trim());

    expect(headings).toMatchInlineSnapshot(`
      [
        "Objet et champ d'application",
        "Création de compte et accès",
        "Fonctionnalités et disponibilité",
        "Responsabilités",
        "Contact",
      ]
    `);
  });

  it('renders key sections in English', () => {
    const i18n = createAppI18n('en');
    const { container } = render(TermsView, {
      global: { plugins: [i18n] },
    });

    const headings = Array.from(container.querySelectorAll('h2')).map((element) => element.textContent?.trim());

    expect(headings).toMatchInlineSnapshot(`
      [
        "Purpose and scope",
        "Account creation and access",
        "Features and availability",
        "Responsibilities",
        "Contact",
      ]
    `);
  });
});

describe('PrivacyView', () => {
  it('renders key sections in French', () => {
    const i18n = createAppI18n('fr');
    const { container } = render(PrivacyView, {
      global: { plugins: [i18n] },
    });

    const headings = Array.from(container.querySelectorAll('h2')).map((element) => element.textContent?.trim());

    expect(headings).toMatchInlineSnapshot(`
      [
        "Collecte des données",
        "Utilisation des données",
        "Droits des personnes",
        "Sécurité et conservation",
        "Contact",
      ]
    `);
  });

  it('renders key sections in English', () => {
    const i18n = createAppI18n('en');
    const { container } = render(PrivacyView, {
      global: { plugins: [i18n] },
    });

    const headings = Array.from(container.querySelectorAll('h2')).map((element) => element.textContent?.trim());

    expect(headings).toMatchInlineSnapshot(`
      [
        "Data collection",
        "Data usage",
        "Individual rights",
        "Security and retention",
        "Contact",
      ]
    `);
  });
});

describe('DpaView', () => {
  it('renders key sections in French', () => {
    const i18n = createAppI18n('fr');
    const { container } = render(DpaView, {
      global: { plugins: [i18n] },
    });

    const headings = Array.from(container.querySelectorAll('h2')).map((element) => element.textContent?.trim());

    expect(headings).toMatchInlineSnapshot(`
      [
        "Objet",
        "Instructions documentées",
        "Mesures de sécurité",
        "Sous-traitance ultérieure",
        "Assistance et coopération",
      ]
    `);
  });

  it('renders key sections in English', () => {
    const i18n = createAppI18n('en');
    const { container } = render(DpaView, {
      global: { plugins: [i18n] },
    });

    const headings = Array.from(container.querySelectorAll('h2')).map((element) => element.textContent?.trim());

    expect(headings).toMatchInlineSnapshot(`
      [
        "Purpose",
        "Documented instructions",
        "Security measures",
        "Sub-processing",
        "Assistance and cooperation",
      ]
    `);
  });
});
