# Internationalisation & Accessibility Strategy

## Localisation

- The web app now uses [`vue-i18n`](https://vue-i18n.intlify.dev/) with English (`en`) and French (`fr`) message catalogs stored in `apps/web/src/locales/`.
- Runtime preferences (locale and accounting currency) are persisted in Pinia (`useAppStore`) and synced with the `vue-i18n` instance during app bootstrap.
- Number and date formatting rely on i18n number/date formats so that currency symbols, grouping and calendars follow the selected locale.
- A dedicated settings page (`/parametres`) lets authenticated users switch locale and currency. Changes are stored locally and immediately reflected across the UI.

## Formatting utilities

- The `useLocaleFormatting` composable centralises currency (`formatCurrency`) and date (`formatDate`) helpers and delegates to the global i18n instance. Components call these helpers instead of using `toFixed`/`toLocaleString` directly so formatting stays consistent with user preferences.
- When the currency preference changes, `updateCurrencyFormat` refreshes the `vue-i18n` number formats so future calls use the right symbol and precision.

## Testing translations

- Snapshot tests in `apps/web/src/locales/__tests__/messages.spec.ts` flatten each locale and keep a stored snapshot per language.
  - The tests guarantee both locales expose the same key structure and help reviewers spot unintended changes to the translation catalog.
  - Update snapshots intentionally via `vitest -u` when new translation keys are introduced.

## Accessibility audits

- Automated accessibility checks use `@axe-core/playwright` inside `apps/web/tests/accessibility.spec.ts`.
  - Each critical screen (dashboard and settings) is exercised with an authenticated session and evaluated against Axe rules.
  - The test suite fails if Axe detects any violations, enforcing WCAG regression coverage during CI.
- UI updates include focus-visible outlines, improved aria labelling and color contrast tweaks to satisfy Axe expectations.
