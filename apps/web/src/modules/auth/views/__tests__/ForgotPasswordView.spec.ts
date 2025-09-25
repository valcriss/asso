import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { defineComponent, h } from 'vue';

import ForgotPasswordView from '../ForgotPasswordView.vue';

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

describe('ForgotPasswordView', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('sends a reset link to the provided e-mail address', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createMockResponse({}, true));
    vi.stubGlobal('fetch', fetchMock);

    render(ForgotPasswordView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    });

    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'membre@example.com');
    await user.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/auth/forgot-password',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    expect(
      screen.getByText(
        /Si cette adresse est enregistrée, un lien de réinitialisation vient de vous être envoyé\./i,
      ),
    ).toBeTruthy();
  });
});
