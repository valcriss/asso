import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createPinia, setActivePinia } from 'pinia';

import OfxImportView from '../OfxImportView.vue';
import { createAppI18n } from '@/lib/i18n';

const sampleOfx = `
<OFX>
  <BANKTRANLIST>
    <STMTTRN>
      <TRNTYPE>CREDIT
      <DTPOSTED>20250305
      <TRNAMT>250.00
      <FITID>20250305001
      <NAME>COTISATIONS MEMBRES MARS
      <MEMO>Cotisations mars</MEMO>
    </STMTTRN>
    <STMTTRN>
      <TRNTYPE>DEBIT
      <DTPOSTED>20250308
      <TRNAMT>-145.50
      <FITID>20250308001
      <NAME>FACTURE IMPRIMEUR AVRIL
      <MEMO>Facture imprimeur</MEMO>
    </STMTTRN>
    <STMTTRN>
      <TRNTYPE>DEBIT
      <DTPOSTED>20250316
      <TRNAMT>-32.80
      <FITID>20250316001
      <NAME>FRAIS BANCAIRES MARS
      <MEMO>Frais de tenue de compte</MEMO>
    </STMTTRN>
  </BANKTRANLIST>
</OFX>
`;

describe('OfxImportView', () => {
  let i18n: ReturnType<typeof createAppI18n>;
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    window.localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
    i18n = createAppI18n();
  });

  it('affiche la progression et les transactions importées', async () => {
    render(OfxImportView, { global: { plugins: [pinia, i18n] } });

    const fileInput = screen.getByTestId('ofx-file-input') as HTMLInputElement;
    const file = new File([sampleOfx], 'transactions.ofx', { type: 'application/x-ofx' });
    const user = userEvent.setup();

    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.queryByTestId('ofx-progress')).not.toBeNull();
    });

    const examinerButtons = await screen.findAllByRole('button', { name: 'Examiner' });
    expect(examinerButtons).toHaveLength(3);
  });

  it('permet de lettrer manuellement et journalise l\'action', async () => {
    render(OfxImportView, { global: { plugins: [pinia, i18n] } });

    const fileInput = screen.getByTestId('ofx-file-input') as HTMLInputElement;
    const file = new File([sampleOfx], 'transactions.ofx', { type: 'application/x-ofx' });
    const user = userEvent.setup();

    await user.upload(fileInput, file);
    const examinerButtons = await screen.findAllByRole('button', { name: 'Examiner' });

    const manualRowButton = examinerButtons[2];
    await user.click(manualRowButton);

    await screen.findByText('Validation manuelle');

    const referenceInput = screen.getByLabelText(/Référence comptable/i);
    await user.clear(referenceInput);
    await user.type(referenceInput, '2025-BANQ-000200');

    const accountInput = screen.getByLabelText(/Compte contrepartie/i);
    await user.type(accountInput, '627000 — Frais bancaires');

    await user.click(screen.getByRole('button', { name: /Créer l'écriture lettrée/i }));

    await waitFor(() => {
      expect(screen.queryAllByText(/Lettrage manuel avec création 2025-BANQ-000200/)).not.toHaveLength(0);
    });

    expect(screen.queryByText('Lettrage de la transaction sélectionnée')).not.toBeNull();
    expect(screen.queryByText(/Aucune action enregistrée/)).toBeNull();
  });
});
