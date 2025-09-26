export interface MemberContribution {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue';
  paymentDate?: string;
  lastReminderAt?: string;
  reminderCount: number;
  receiptUrl?: string;
}

export interface MemberInvoice {
  id: string;
  label: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
  downloadUrl: string;
}

export interface MemberPayment {
  id: string;
  amount: number;
  date: string;
  method: 'Carte' | 'Virement' | 'Espèces' | 'Chèque';
  reference: string;
  note?: string;
  receiptUrl?: string;
}

export interface MemberProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  membershipType: string;
  status: 'A_JOUR' | 'EN_RETARD' | 'EN_ATTENTE';
  joinDate: string;
  nextRenewalDate: string;
  lastPaymentDate?: string;
  outstandingBalance: number;
  totalContributions: number;
  tags: string[];
  contributions: MemberContribution[];
  payments: MemberPayment[];
  invoices: MemberInvoice[];
}

export const membersDirectory: MemberProfile[] = [
  {
    id: 'mem-001',
    firstName: 'Lina',
    lastName: 'Durand',
    email: 'lina.durand@example.org',
    phone: '+33 6 12 34 56 78',
    address: '12 rue des Glycines, 75011 Paris',
    membershipType: 'Adhésion annuelle',
    status: 'A_JOUR',
    joinDate: '2021-09-12',
    nextRenewalDate: '2025-09-30',
    lastPaymentDate: '2024-09-18',
    outstandingBalance: 0,
    totalContributions: 320,
    tags: ['Bénévole', 'Bureau'],
    contributions: [
      {
        id: 'cot-2024-001',
        label: 'Cotisation 2024',
        amount: 160,
        dueDate: '2024-09-30',
        status: 'paid',
        paymentDate: '2024-09-18',
        reminderCount: 0,
        receiptUrl: '/documents/recus/cotisation-2024.pdf',
      },
      {
        id: 'cot-2025-001',
        label: 'Cotisation 2025',
        amount: 160,
        dueDate: '2025-09-30',
        status: 'pending',
        reminderCount: 0,
      },
    ],
    payments: [
      {
        id: 'pay-2024-001',
        amount: 160,
        date: '2024-09-18',
        method: 'Virement',
        reference: 'VIR-SEPA-98432',
        note: 'Renouvellement adhésion 2024',
        receiptUrl: '/documents/recus/cotisation-2024.pdf',
      },
      {
        id: 'pay-2023-001',
        amount: 160,
        date: '2023-09-19',
        method: 'Carte',
        reference: 'CB-4857',
        note: 'Cotisation annuelle',
        receiptUrl: '/documents/recus/cotisation-2023.pdf',
      },
    ],
    invoices: [
      {
        id: 'inv-2024-001',
        label: 'Facture cotisation 2024',
        issueDate: '2024-08-31',
        dueDate: '2024-09-30',
        amount: 160,
        status: 'paid',
        downloadUrl: '/documents/factures/facture-cotisation-2024.pdf',
      },
      {
        id: 'inv-2025-001',
        label: 'Facture cotisation 2025',
        issueDate: '2025-08-31',
        dueDate: '2025-09-30',
        amount: 160,
        status: 'pending',
        downloadUrl: '/documents/factures/facture-cotisation-2025.pdf',
      },
    ],
  },
  {
    id: 'mem-002',
    firstName: 'Sofiane',
    lastName: 'Benali',
    email: 'sofiane.benali@example.org',
    phone: '+33 7 81 45 09 22',
    address: '8 avenue des Tilleuls, 69003 Lyon',
    membershipType: 'Tarif solidaire',
    status: 'EN_RETARD',
    joinDate: '2022-01-04',
    nextRenewalDate: '2025-02-28',
    lastPaymentDate: '2023-02-18',
    outstandingBalance: 90,
    totalContributions: 270,
    tags: ['Public cible', 'Projet Inclusion'],
    contributions: [
      {
        id: 'cot-2023-014',
        label: 'Cotisation 2023',
        amount: 90,
        dueDate: '2023-02-28',
        status: 'paid',
        paymentDate: '2023-02-18',
        reminderCount: 1,
        receiptUrl: '/documents/recus/cotisation-2023-014.pdf',
      },
      {
        id: 'cot-2024-014',
        label: 'Cotisation 2024',
        amount: 90,
        dueDate: '2024-02-28',
        status: 'overdue',
        reminderCount: 3,
        lastReminderAt: '2024-05-05',
      },
      {
        id: 'cot-2025-014',
        label: 'Cotisation 2025',
        amount: 90,
        dueDate: '2025-02-28',
        status: 'pending',
        reminderCount: 0,
      },
    ],
    payments: [
      {
        id: 'pay-2023-014',
        amount: 90,
        date: '2023-02-18',
        method: 'Chèque',
        reference: 'CHEQUE-1025',
        note: 'Cotisation solidaire',
        receiptUrl: '/documents/recus/cotisation-2023-014.pdf',
      },
    ],
    invoices: [
      {
        id: 'inv-2024-014',
        label: 'Facture cotisation 2024',
        issueDate: '2024-01-31',
        dueDate: '2024-02-28',
        amount: 90,
        status: 'overdue',
        downloadUrl: '/documents/factures/facture-cotisation-2024-014.pdf',
      },
      {
        id: 'inv-2025-014',
        label: 'Facture cotisation 2025',
        issueDate: '2025-01-31',
        dueDate: '2025-02-28',
        amount: 90,
        status: 'pending',
        downloadUrl: '/documents/factures/facture-cotisation-2025-014.pdf',
      },
    ],
  },
  {
    id: 'mem-003',
    firstName: 'Zoé',
    lastName: 'Martinelli',
    email: 'zoe.martinelli@example.org',
    phone: '+33 6 77 02 41 88',
    address: '27 boulevard de la République, 44000 Nantes',
    membershipType: 'Adhésion famille',
    status: 'EN_ATTENTE',
    joinDate: '2024-04-22',
    nextRenewalDate: '2025-04-30',
    outstandingBalance: 0,
    totalContributions: 180,
    tags: ['Nouvelle adhérente'],
    contributions: [
      {
        id: 'cot-2024-033',
        label: 'Cotisation 2024',
        amount: 180,
        dueDate: '2024-04-30',
        status: 'paid',
        paymentDate: '2024-04-25',
        reminderCount: 0,
        receiptUrl: '/documents/recus/cotisation-2024-033.pdf',
      },
      {
        id: 'cot-2025-033',
        label: 'Cotisation 2025',
        amount: 180,
        dueDate: '2025-04-30',
        status: 'pending',
        reminderCount: 0,
      },
    ],
    payments: [
      {
        id: 'pay-2024-033',
        amount: 180,
        date: '2024-04-25',
        method: 'Carte',
        reference: 'CB-9901',
        note: 'Première adhésion',
        receiptUrl: '/documents/recus/cotisation-2024-033.pdf',
      },
    ],
    invoices: [
      {
        id: 'inv-2024-033',
        label: 'Facture cotisation 2024',
        issueDate: '2024-04-01',
        dueDate: '2024-04-30',
        amount: 180,
        status: 'paid',
        downloadUrl: '/documents/factures/facture-cotisation-2024-033.pdf',
      },
      {
        id: 'inv-2025-033',
        label: 'Facture cotisation 2025',
        issueDate: '2025-04-01',
        dueDate: '2025-04-30',
        amount: 180,
        status: 'pending',
        downloadUrl: '/documents/factures/facture-cotisation-2025-033.pdf',
      },
    ],
  },
];
