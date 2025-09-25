import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { defineComponent, h } from 'vue';

import ResetPasswordView from '../ResetPasswordView.vue';

function createMockResponse(body: unknown, ok = true) {
  return {
    ok,
    async json() {
      return body;
    },
  } as Response;
}

const RouterLinkStub = defineComponent({
  name: 'RouterLinkStub',
  props: {
    to: {
      type: [String, Object],
      required: false,
    },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'a',
        {
          href:
            typeof props.to === 'string'
              ? props.to
              : (props.to as { path?: string } | undefined)?.path ?? '#',
        },
        slots.default ? slots.default() : [],
      );
  },
});

describe('ResetPasswordView', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('updates the password when the token is valid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createMockResponse({}, true));
    vi.stubGlobal('fetch', fetchMock);

    render(ResetPasswordView, {
      props: {
        token: 'reset-token',
      },
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    });

    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/nouveau mot de passe/i), 'supersecret');
    await user.type(screen.getByLabelText(/confirmer le mot de passe/i), 'supersecret');
    await user.click(screen.getByRole('button', { name: /mettre à jour le mot de passe/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/auth/reset-password',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    expect(
      screen.getByText(/Votre mot de passe a été mis à jour avec succès\./i),
    ).toBeTruthy();
  });

  it('disables the form when the token is missing', () => {
    render(ResetPasswordView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    });

    expect(
      screen.getByText(/Le lien de réinitialisation est invalide ou expiré/i),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /retour à la connexion/i })).toBeTruthy();
  });
});
