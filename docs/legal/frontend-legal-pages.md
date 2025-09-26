# Legal Frontend Pages

This document describes how the public legal pages (Terms of Service, Privacy Policy and Data Processing Agreement) are managed in the web frontend.

## Page structure

- Source files live in `apps/web/src/modules/legal/views/` and share the `LegalDocumentPage` component.
- Static content is retrieved from the i18n catalog to guarantee parity between locales.
- Routes are declared in `apps/web/src/modules/legal/routes.ts` and use the `public` layout so they are available without authentication.

## Localization

- Translations for French (`fr`) and English (`en`) are stored in `apps/web/src/locales/fr.json` and `apps/web/src/locales/en.json` under the `legal` namespace.
- Each section is described with a title and a list of paragraph strings to keep snapshots readable.
- The layout strings (`legal.actions.*`, `legal.common.*`) must exist in both locales before adding new sections.
- When updating content, run `npm exec -w apps/web vitest --update` to refresh the snapshots that validate the structure of each document.

## PDF export

- The `LegalDocumentPage` component uses `jspdf` to produce downloadable PDFs based on the rendered sections.
- Filenames are localized through the i18n keys `legal.<document>.fileName` so that the downloaded file reflects the active locale.

## Update checklist

1. Modify the relevant entries inside `apps/web/src/locales/{fr,en}.json`.
2. If new sections are introduced, add matching paragraph keys for both locales to keep the JSON structures identical.
3. Run `npm exec -w apps/web vitest` to ensure the rendering snapshots still cover every section.
4. Update this document if the export workflow or localization structure changes.
