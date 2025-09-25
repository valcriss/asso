import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function applyTenantContext(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  const statement = Prisma.sql`SET LOCAL app.current_org = ${Prisma.raw(`'${organizationId}'`)};`;
  await tx.$executeRaw(statement);
}

async function main() {
  const existing = await prisma.organization.findFirst({ where: { name: 'Association Démo' } });

  if (existing) {
    console.log('La donnée de démonstration existe déjà, aucune action nécessaire.');
    return;
  }

  const organization = await prisma.organization.create({
    data: {
      name: 'Association Démo',
    },
  });

  await prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, organization.id);

    const accountsDefinitions = [
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
    ] as const;

    const accounts = new Map<string, { id: string }>();

    for (const definition of accountsDefinitions) {
      const account = await tx.account.create({
        data: {
          organizationId: organization.id,
          code: definition.code,
          name: definition.name,
          type: definition.type,
        },
      });

      accounts.set(definition.code, { id: account.id });
    }

    const journalsDefinitions = [
      { code: 'BANQ', name: 'Journal de banque', type: 'BANK' },
      { code: 'CAIS', name: 'Journal de caisse', type: 'CASH' },
      { code: 'VENT', name: 'Journal des ventes', type: 'SALES' },
      { code: 'ACHAT', name: 'Journal des achats', type: 'PURCHASE' },
    ] as const;

    const journals = new Map<string, { id: string }>();

    for (const definition of journalsDefinitions) {
      const journal = await tx.journal.create({
        data: {
          organizationId: organization.id,
          code: definition.code,
          name: definition.name,
          type: definition.type,
        },
      });

      journals.set(definition.code, { id: journal.id });
    }

    const fiscalYear = await tx.fiscalYear.create({
      data: {
        organizationId: organization.id,
        label: 'Exercice 2025',
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        endDate: new Date('2025-12-31T23:59:59.999Z'),
      },
    });

    const bankAccount = await tx.bankAccount.create({
      data: {
        organizationId: organization.id,
        accountId: accounts.get('512')!.id,
        name: 'Crédit Agricole - Compte courant',
        iban: 'FR7630006000011234567890189',
        bic: 'AGRIFRPP',
      },
    });

    await tx.member.createMany({
      data: [
        {
          organizationId: organization.id,
          firstName: 'Marie',
          lastName: 'Dupont',
          email: 'marie.dupont@example.com',
          membershipType: 'ADHERENT',
          joinedAt: new Date('2022-09-12T00:00:00.000Z'),
          rgpdConsentAt: new Date('2022-09-12T00:00:00.000Z'),
        },
        {
          organizationId: organization.id,
          firstName: 'Hugo',
          lastName: 'Martin',
          email: 'hugo.martin@example.com',
          membershipType: 'BENEVOLE',
          joinedAt: new Date('2023-03-02T00:00:00.000Z'),
          rgpdConsentAt: new Date('2023-03-02T00:00:00.000Z'),
        },
        {
          organizationId: organization.id,
          firstName: 'Leïla',
          lastName: 'Benali',
          email: 'leila.benali@example.com',
          membershipType: 'ADMINISTRATEUR',
          joinedAt: new Date('2021-11-20T00:00:00.000Z'),
          rgpdConsentAt: new Date('2021-11-20T00:00:00.000Z'),
        },
      ],
    });

    const donationEntry1 = await tx.entry.create({
      data: {
        organizationId: organization.id,
        fiscalYearId: fiscalYear.id,
        journalId: journals.get('BANQ')!.id,
        date: new Date('2025-02-15T00:00:00.000Z'),
        memo: 'Don Marie Dupont',
        lines: {
          create: [
            {
              organizationId: organization.id,
              accountId: accounts.get('512')!.id,
              debit: new Prisma.Decimal('150.00'),
              credit: new Prisma.Decimal('0'),
            },
            {
              organizationId: organization.id,
              accountId: accounts.get('706')!.id,
              debit: new Prisma.Decimal('0'),
              credit: new Prisma.Decimal('150.00'),
            },
          ],
        },
      },
    });

    await tx.donation.create({
      data: {
        organizationId: organization.id,
        fiscalYearId: fiscalYear.id,
        entryId: donationEntry1.id,
        donorName: 'Marie Dupont',
        donorEmail: 'marie.dupont@example.com',
        amount: new Prisma.Decimal('150.00'),
        receiptNumber: '2025-0001',
        receiptHash: 'demo-receipt-hash-0001',
        receiptUrl: 'https://example.org/receipts/2025-0001.pdf',
        receivedAt: new Date('2025-02-15T00:00:00.000Z'),
        issuedAt: new Date('2025-02-16T00:00:00.000Z'),
      },
    });

    const donationEntry2 = await tx.entry.create({
      data: {
        organizationId: organization.id,
        fiscalYearId: fiscalYear.id,
        journalId: journals.get('BANQ')!.id,
        date: new Date('2025-03-22T00:00:00.000Z'),
        memo: 'Collecte soirée de soutien',
        lines: {
          create: [
            {
              organizationId: organization.id,
              accountId: accounts.get('512')!.id,
              debit: new Prisma.Decimal('320.00'),
              credit: new Prisma.Decimal('0'),
            },
            {
              organizationId: organization.id,
              accountId: accounts.get('756')!.id,
              debit: new Prisma.Decimal('0'),
              credit: new Prisma.Decimal('320.00'),
            },
          ],
        },
      },
    });

    await tx.donation.create({
      data: {
        organizationId: organization.id,
        fiscalYearId: fiscalYear.id,
        entryId: donationEntry2.id,
        donorName: 'Soirée de soutien',
        amount: new Prisma.Decimal('320.00'),
        receiptNumber: '2025-0002',
        receiptHash: 'demo-receipt-hash-0002',
        receiptUrl: 'https://example.org/receipts/2025-0002.pdf',
        receivedAt: new Date('2025-03-22T00:00:00.000Z'),
        issuedAt: new Date('2025-03-23T00:00:00.000Z'),
      },
    });

    await tx.bankStatement.create({
      data: {
        organizationId: organization.id,
        bankAccountId: bankAccount.id,
        statementDate: new Date('2025-03-31T00:00:00.000Z'),
        openingBalance: new Prisma.Decimal('980.00'),
        closingBalance: new Prisma.Decimal('1330.00'),
      },
    });
  });

  console.log('Tenant de démonstration créé avec succès.');
}

main()
  .catch((error) => {
    console.error('Échec du chargement des données de démonstration', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
