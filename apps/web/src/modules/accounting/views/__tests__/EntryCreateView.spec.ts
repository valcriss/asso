import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createPinia, setActivePinia, type Pinia } from 'pinia';

import EntryCreateView from '../EntryCreateView.vue';
import { createAppI18n } from '@/lib/i18n';

function createMockResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
    async blob() {
      return new Blob([JSON.stringify(body ?? {})]);
    },
  } as Response;
}

describe('EntryCreateView', () => {
  let pinia: Pinia;
  let i18n: ReturnType<typeof createAppI18n>;

  beforeEach(() => {
    window.localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
    i18n = createAppI18n();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates and submits a balanced entry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({
          data: {
            fiscalYears: [
              {
                id: 'fy-1',
                label: 'Exercice 2025',
                startDate: '2025-01-01',
                endDate: '2025-12-31',
                status: 'OPEN',
                lockedAt: null,
              },
            ],
            currentFiscalYear: {
              id: 'fy-1',
              label: 'Exercice 2025',
              startDate: '2025-01-01',
              endDate: '2025-12-31',
              status: 'OPEN',
              lockedAt: null,
            },
            journals: [
              {
                id: 'journal-1',
                code: 'BAN',
                name: 'Banque',
                nextReference: '2025-BAN-000005',
                lastReference: '2025-BAN-000004',
                lastEntryDate: '2025-02-01',
              },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        createMockResponse({
          data: [
            { id: 'acc-1', code: '512000', name: 'Banque' },
            { id: 'acc-2', code: '606000', name: 'Fournitures' },
          ],
        })
      )
      .mockResolvedValueOnce(
        createMockResponse({
          data: [{ id: 'journal-1', code: 'BAN', name: 'Banque' }],
        })
      )
      .mockResolvedValueOnce(createMockResponse({ data: { reference: '2025-BAN-000005' } }, true, 201));

    vi.stubGlobal('fetch', fetchMock);

    render(EntryCreateView, {
      global: {
        plugins: [pinia, i18n],
      },
    });

    await screen.findByText('Nouvelle écriture');
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const textInputs = screen.getAllByRole('textbox');
    const accountInputs = textInputs.filter(
      (element) => element.getAttribute('placeholder') === '512000 — Banque'
    );
    expect(accountInputs).toHaveLength(2);
    const debitInput = screen.getAllByRole('spinbutton')[0];
    const creditInput = screen.getAllByRole('spinbutton')[3];

    const user = userEvent.setup();

    await user.click(accountInputs[0]);
    await user.type(accountInputs[0], '512000');
    await user.click(await screen.findByText('512000 — Banque'));
    await user.clear(debitInput);
    await user.type(debitInput, '200');

    await user.click(accountInputs[1]);
    await user.type(accountInputs[1], '606000');
    await user.click(await screen.findByText('606000 — Fournitures'));
    await user.clear(creditInput);
    await user.type(creditInput, '200');

    await user.click(screen.getByRole('button', { name: /enregistrer l'écriture/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    await screen.findByText(/L'écriture a été créée/);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/entries'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('detects imbalance and displays validation message', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({
          data: {
            fiscalYears: [
              { id: 'fy-1', label: 'Exercice 2025', startDate: '2025-01-01', endDate: '2025-12-31', status: 'OPEN', lockedAt: null },
            ],
            currentFiscalYear: {
              id: 'fy-1',
              label: 'Exercice 2025',
              startDate: '2025-01-01',
              endDate: '2025-12-31',
              status: 'OPEN',
              lockedAt: null,
            },
            journals: [
              { id: 'journal-1', code: 'BAN', name: 'Banque', nextReference: null, lastReference: null, lastEntryDate: null },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        createMockResponse({
          data: [
            { id: 'acc-1', code: '512000', name: 'Banque' },
            { id: 'acc-2', code: '706000', name: 'Cotisations' },
          ],
        })
      )
      .mockResolvedValueOnce(
        createMockResponse({
          data: [{ id: 'journal-1', code: 'BAN', name: 'Banque' }],
        })
      );

    vi.stubGlobal('fetch', fetchMock);

    render(EntryCreateView, {
      global: { plugins: [pinia, i18n] },
    });

    await screen.findByText('Nouvelle écriture');
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    const textInputs = screen.getAllByRole('textbox');
    const accountInputs = textInputs.filter(
      (element) => element.getAttribute('placeholder') === '512000 — Banque'
    );
    expect(accountInputs).toHaveLength(2);
    const spinButtons = screen.getAllByRole('spinbutton');
    const user = userEvent.setup();

    await user.click(accountInputs[0]);
    await user.type(accountInputs[0], '512000');
    await user.click(await screen.findByText('512000 — Banque'));
    await user.clear(spinButtons[0]);
    await user.type(spinButtons[0], '150');

    await user.click(accountInputs[1]);
    await user.type(accountInputs[1], '706000');
    await user.click(await screen.findByText('706000 — Cotisations'));
    await user.clear(spinButtons[3]);
    await user.type(spinButtons[3], '120');

    await user.click(screen.getByRole('button', { name: /enregistrer l'écriture/i }));

    await screen.findByText(/Veuillez corriger les erreurs/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
