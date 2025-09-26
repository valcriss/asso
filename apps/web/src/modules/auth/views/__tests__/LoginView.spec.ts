import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';

import LoginView from '../LoginView.vue';
import { createAppRouter } from '@/router';
import { useAuthStore } from '@/store';

function createMockResponse(body: unknown, ok = true) {
  return {
    ok,
    async json() {
      return body;
    },
  } as Response;
}

describe('LoginView', () => {
  beforeAll(() => {
    (window as unknown as { scrollTo?: () => void }).scrollTo = vi.fn();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('authenticates the user and redirects to the dashboard', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        user: { id: '1', email: 'admin@example.com', roles: ['ADMIN'], isSuperAdmin: false },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pinia = createPinia();
    setActivePinia(pinia);

    const router = createAppRouter(createMemoryHistory());
    await router.push('/connexion');
    await router.isReady();

    render(LoginView, {
      global: {
        plugins: [pinia, router],
      },
    });

    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'admin@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/auth/login',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    const authStore = useAuthStore();

    await waitFor(() => {
      expect(authStore.isAuthenticated).toBe(true);
    });

    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe('dashboard.home');
    });
  });
});
