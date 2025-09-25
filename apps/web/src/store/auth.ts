import { defineStore } from 'pinia';

type RefreshTimeout = ReturnType<typeof setTimeout> | null;

export type UserRole = 'ADMIN' | 'TREASURER' | 'SECRETARY' | 'VIEWER';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName?: string;
  roles: UserRole[];
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user?: AuthenticatedUser;
}

interface PersistedSession {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  user: AuthenticatedUser | null;
}

interface AuthState extends PersistedSession {
  status: 'idle' | 'authenticating' | 'authenticated';
  error: string | null;
  refreshTimeoutId: RefreshTimeout;
  isInitialized: boolean;
}

const STORAGE_KEY = 'asso.auth.session';
const API_BASE_URL = '/api/v1/auth';

async function readErrorMessage(response: Response) {
  try {
    const data = await response.json();
    if (typeof data?.detail === 'string') {
      return data.detail;
    }
    if (typeof data?.message === 'string') {
      return data.message;
    }
  } catch (error) {
    console.warn('Unable to parse error response', error);
  }
  return 'Une erreur est survenue. Veuillez réessayer.';
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    user: null,
    status: 'idle',
    error: null,
    refreshTimeoutId: null,
    isInitialized: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken),
    roles: (state) => state.user?.roles ?? [],
    hasRole() {
      return (role: UserRole) => this.roles.includes(role);
    },
    hasAnyRole() {
      return (expectedRoles: UserRole[]) => {
        if (!expectedRoles.length) {
          return true;
        }
        return expectedRoles.some((role) => this.roles.includes(role));
      };
    },
    authorizationHeader: (state) =>
      state.accessToken ? { Authorization: `Bearer ${state.accessToken}` } : undefined,
  },
  actions: {
    async initializeFromStorage() {
      if (this.isInitialized) {
        return;
      }

      if (typeof window === 'undefined') {
        this.isInitialized = true;
        return;
      }

      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as PersistedSession;
          this.accessToken = parsed.accessToken;
          this.refreshToken = parsed.refreshToken;
          this.expiresAt = parsed.expiresAt;
          this.user = parsed.user ?? null;

          if (this.accessToken && this.refreshToken && this.expiresAt) {
            const secondsUntilExpiration = Math.floor((this.expiresAt - Date.now()) / 1000);
            if (secondsUntilExpiration <= 0) {
              await this.refreshTokens().catch(() => this.logout());
            } else {
              this.scheduleRefresh(secondsUntilExpiration);
              this.status = 'authenticated';
            }
          }
        } catch (error) {
          console.warn('Unable to restore authentication session', error);
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }

      this.isInitialized = true;
    },
    async login(payload: { email: string; password: string }) {
      if (this.status === 'authenticating') {
        return;
      }

      this.status = 'authenticating';
      this.error = null;

      try {
        const response = await fetch(`${API_BASE_URL}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const data = (await response.json()) as LoginResponse;
        this.applySession(data.accessToken, data.refreshToken, data.expiresIn, data.user);
        this.status = 'authenticated';
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Connexion impossible.';
        this.error = message;
        this.status = 'idle';
        throw error;
      }
    },
    async refreshTokens() {
      if (!this.refreshToken) {
        throw new Error('Token de rafraîchissement absent.');
      }

      try {
        const response = await fetch(`${API_BASE_URL}/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const data = (await response.json()) as RefreshResponse;
        this.applySession(
          data.accessToken,
          data.refreshToken,
          data.expiresIn,
          data.user ?? this.user ?? null,
        );
      } catch (error) {
        this.logout();
        throw error;
      }
    },
    logout() {
      this.clearRefreshTimer();
      this.accessToken = null;
      this.refreshToken = null;
      this.expiresAt = null;
      this.user = null;
      this.status = 'idle';
      this.error = null;
      this.persistSession();
    },
    clearRefreshTimer() {
      if (this.refreshTimeoutId) {
        clearTimeout(this.refreshTimeoutId);
        this.refreshTimeoutId = null;
      }
    },
    applySession(
      accessToken: string,
      refreshToken: string,
      expiresIn: number,
      user: AuthenticatedUser | null,
    ) {
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.expiresAt = Date.now() + expiresIn * 1000;
      this.user = user;
      this.error = null;
      this.status = 'authenticated';
      this.persistSession();
      this.scheduleRefresh(expiresIn);
    },
    scheduleRefresh(expiresInSeconds: number) {
      this.clearRefreshTimer();
      if (typeof window === 'undefined') {
        return;
      }
      const refreshDelay = Math.max(expiresInSeconds - 30, 5) * 1000;
      this.refreshTimeoutId = window.setTimeout(() => {
        this.refreshTokens().catch(() => {
          this.logout();
        });
      }, refreshDelay);
    },
    persistSession() {
      if (typeof window === 'undefined') {
        return;
      }

      const payload: PersistedSession = {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        expiresAt: this.expiresAt,
        user: this.user,
      };

      if (!payload.accessToken && !payload.refreshToken) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
    },
  },
});
