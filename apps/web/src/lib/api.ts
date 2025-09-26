import { useAuthStore } from '@/store';

export async function apiRequest(input: string, init: RequestInit = {}): Promise<Response> {
  const authStore = useAuthStore();
  const headers = new Headers(init.headers ?? {});

  const authHeader = authStore.authorizationHeader;
  if (authHeader?.Authorization) {
    headers.set('Authorization', authHeader.Authorization);
  }

  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(input, { ...init, headers });
}

export async function apiFetchJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const response = await apiRequest(input, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init.headers),
    },
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  return (await response.json()) as T;
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.detail === 'string') {
      return data.detail;
    }
    if (typeof data?.message === 'string') {
      return data.message;
    }
  } catch (error) {
    console.warn('Failed to parse API error response', error);
  }

  return 'Une erreur est survenue. Merci de réessayer.';
}
