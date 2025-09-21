import type { AccountType } from './schemas';

export interface DefaultAccountDefinition {
  code: string;
  name: string;
  type: AccountType;
}

export const DEFAULT_CHART_OF_ACCOUNTS: ReadonlyArray<DefaultAccountDefinition> = Object.freeze([
  { code: '101', name: 'Capital associatif', type: 'EQUITY' },
  { code: '106', name: 'Réserves', type: 'EQUITY' },
  { code: '110', name: "Report à nouveau créditeur", type: 'EQUITY' },
  { code: '120', name: "Résultat de l'exercice", type: 'EQUITY' },
  { code: '203', name: "Frais d'établissement", type: 'ASSET' },
  { code: '215', name: 'Installations techniques', type: 'ASSET' },
  { code: '281', name: 'Amortissements des immobilisations corporelles', type: 'ASSET' },
  { code: '401', name: 'Fournisseurs', type: 'LIABILITY' },
  { code: '411', name: 'Clients', type: 'ASSET' },
  { code: '512', name: 'Banque', type: 'ASSET' },
  { code: '530', name: 'Caisse', type: 'ASSET' },
  { code: '606', name: 'Achats non stockés de matières et fournitures', type: 'EXPENSE' },
  { code: '618', name: 'Documentation générale', type: 'EXPENSE' },
  { code: '6451', name: 'Cotisations sociales (URSSAF, etc.)', type: 'EXPENSE' },
  { code: '706', name: 'Prestations de services', type: 'REVENUE' },
  { code: '740', name: "Subventions d'exploitation", type: 'REVENUE' },
  { code: '756', name: 'Quêtes et collectes', type: 'REVENUE' },
  { code: '860', name: 'Emplois des contributions volontaires', type: 'OFF_BALANCE' },
  { code: '870', name: 'Ressources contributions volontaires', type: 'OFF_BALANCE' },
]);
