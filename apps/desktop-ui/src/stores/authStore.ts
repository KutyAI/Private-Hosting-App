import { create } from 'zustand';
import {
  getCurrentUser,
  getReadableAuthError,
  getSupabaseConfigurationError,
  registerDevice as registerDeviceApi,
  signIn,
  signOut,
  signUp,
  signInWithOAuth,
} from '../services/supabaseClient';

interface AuthUser {
  id: string;
  email: string;
  display_name: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithOAuth: (provider: 'github' | 'google') => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  registerDevice: (name: string, key: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { user, session } = await signIn(email, password);
      if (user && session) {
        set({
          user: {
            id: user.id,
            email: user.email || '',
            display_name: user.user_metadata?.display_name || '',
          },
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        throw new Error('Login failed. Please try again.');
      }
    } catch (err) {
      const message = getReadableAuthError(err);
      set({ isLoading: false, isAuthenticated: false, error: message });
      throw new Error(message);
    }
  },
  register: async (email, password, name) => {
    set({ isLoading: true, error: null });
    try {
      const { user, session } = await signUp(email, password, name);
      if (user && session) {
        set({
          user: {
            id: user.id,
            email: user.email || '',
            display_name: user.user_metadata?.display_name || name,
          },
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else if (user && !session) {
        throw new Error('Account created, but email confirmation is still required before you can sign in.');
      } else {
        throw new Error('Registration failed. Please try again.');
      }
    } catch (err) {
      const message = getReadableAuthError(err);
      set({ isLoading: false, isAuthenticated: false, error: message });
      throw new Error(message);
    }
  },
  logout: async () => {
    try {
      await signOut();
    } finally {
      set({ user: null, isAuthenticated: false, error: null, isLoading: false });
    }
  },
  checkAuth: async () => {
    const configurationError = getSupabaseConfigurationError();
    if (configurationError) {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: configurationError,
      });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const user = await getCurrentUser();
      if (user) {
        set({
          user: {
            id: user.id,
            email: user.email || '',
            display_name: user.user_metadata?.display_name || '',
          },
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false, error: null });
      }
    } catch (err) {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: getReadableAuthError(err),
      });
    }
  },
  registerDevice: async (name, key) => {
    await registerDeviceApi(name, key);
  },
  loginWithOAuth: async (provider) => {
    set({ isLoading: true, error: null });
    try {
      await signInWithOAuth(provider);
    } catch (err) {
      const message = getReadableAuthError(err);
      set({ isLoading: false, isAuthenticated: false, error: message });
      throw new Error(message);
    }
  },
  clearError: () => {
    set({ error: null });
  },
}));
