import type { JournalType } from './schemas';

export interface DefaultJournalDefinition {
  code: string;
  name: string;
  type: JournalType;
}

export const DEFAULT_JOURNALS: ReadonlyArray<DefaultJournalDefinition> = Object.freeze([
  { code: 'GEN', name: 'Journal général', type: 'GENERAL' },
  { code: 'ACH', name: 'Journal des achats', type: 'PURCHASE' },
  { code: 'VEN', name: 'Journal des ventes', type: 'SALES' },
  { code: 'BAN', name: 'Journal de banque', type: 'BANK' },
  { code: 'CAI', name: 'Journal de caisse', type: 'CASH' },
  { code: 'ODS', name: 'Opérations diverses', type: 'MISC' },
]);
