import { describe, expect, it, vi } from 'vitest';
import { renderEmailTemplate } from '../templates';
import {
  InMemoryEmailQueue,
  createEmailProcessor,
  type EmailJob,
} from '../service';
import type { Transporter } from 'nodemailer';

describe('email templates rendering', () => {
  it('renders the receipt template with the provided values', () => {
    const result = renderEmailTemplate('receipt', {
      organizationName: 'Association Bleu',
      recipientName: 'Camille Dupont',
      amount: '150,00 €',
      receiptNumber: 'REC-2025-0012',
      issuedAt: '12/02/2025',
      fiscalYearLabel: 'Exercice 2024-2025',
      downloadUrl: 'https://asso.test/receipts/REC-2025-0012.pdf',
    });

    expect(result.subject).toContain('REC-2025-0012');
    expect(result.html).toContain('Camille Dupont');
    expect(result.html).toContain('150,00 €');
    expect(result.html).toContain('Exercice 2024-2025');
    expect(result.html).toContain('Télécharger le reçu');
    expect(result.text).toContain('Merci pour votre soutien précieux');
  });

  it('renders the reminder template with due date and call to action', () => {
    const result = renderEmailTemplate('reminder', {
      organizationName: 'Association Bleu',
      memberName: 'Léa Martin',
      dueDate: '30/09/2025',
      amount: '75,00 €',
      paymentLink: 'https://asso.test/payments/cotisation',
      supportContact: 'tresorier@asso.test',
    });

    expect(result.subject).toContain('Léa Martin');
    expect(result.html).toContain('30/09/2025');
    expect(result.html).toContain('Régler ma cotisation');
    expect(result.text).toContain('tresorier@asso.test');
  });

  it('renders the alert template according to severity and action', () => {
    const result = renderEmailTemplate('alert', {
      organizationName: 'Association Bleu',
      title: 'Clôture d\'exercice imminente',
      message: 'La clôture de l\'exercice doit être finalisée avant le 15 décembre.',
      severity: 'warning',
      actionLabel: 'Accéder au module de clôture',
      actionUrl: 'https://asso.test/accounting/close',
    });

    expect(result.subject).toContain('Clôture d\'exercice');
    expect(result.html).toContain('Accéder au module de clôture');
    expect(result.html).toContain('https://asso.test/accounting/close');
    expect(result.category).toBe('alert');
  });
});

describe('email service', () => {
  it('processes jobs through the in-memory queue', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc' });
    const transporter = { sendMail } as unknown as Transporter;
    const processor = createEmailProcessor(transporter, {
      defaultFrom: 'no-reply@asso.test',
    });

    const queue = new InMemoryEmailQueue(processor);
    const job: EmailJob<'reminder'> = {
      to: 'lea@example.org',
      template: 'reminder',
      payload: {
        organizationName: 'Association Bleu',
        memberName: 'Léa Martin',
        dueDate: '30/09/2025',
        amount: '75,00 €',
        paymentLink: 'https://asso.test/payments/cotisation',
      },
    };

    await queue.enqueue(job);

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'lea@example.org',
        from: 'no-reply@asso.test',
      })
    );
  });

  it('propagates SMTP errors so that BullMQ records a bounce', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('Mailbox full'));
    const transporter = { sendMail } as unknown as Transporter;
    const processor = createEmailProcessor(transporter, {
      defaultFrom: 'no-reply@asso.test',
    });

    await expect(
      processor({
        to: 'lea@example.org',
        template: 'alert',
        payload: {
          organizationName: 'Association Bleu',
          title: 'Echec de synchronisation bancaire',
          message: 'La dernière synchronisation bancaire a échoué.',
        },
      })
    ).rejects.toThrow('Mailbox full');

    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
