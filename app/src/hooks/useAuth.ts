// Unified authentication hook that works for both web (Auth0) and mobile (ASWebAuthenticationSession)
import { useAuth0 } from '@auth0/auth0-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { isMobile } from '@utils/platform';
import { authenticate } from '@inkibra/tauri-plugin-auth';

const AUTH0_DOMAIN = 'auth.observer-ai.com';
const AUTH0_CLIENT_ID = 'R5iv3RVkWjGZrexFSJ6HqlhSaaGLyFpm';
const AUTH0_AUDIENCE = 'https://api.observer-ai.com';
const CALLBACK_SCHEME = 'observerai';
const MOBILE_CALLBACK_URL = `${CALLBACK_SCHEME}://callback`;
const STORAGE_KEY = 'observer_auth_tokens';

// PKCE helpers
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (v) => charset[v % charset.length]).join('');
}

async function generatePKCE() {
  const verifier = generateRandomString(64);
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { verifier, challenge };
}

function parseJwt(token: string): { name?: string; email?: string; sub?: string } | null {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

// Token storage helpers
interface StoredTokens {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_at: number;
}

function getStoredTokens(): StoredTokens | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function storeTokens(tokens: { access_token: string; id_token: string; refresh_token?: string; expires_in: number }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...tokens,
    expires_at: Date.now() + (tokens.expires_in * 1000),
  }));
}

function clearStoredTokens() {
  localStorage.removeItem(STORAGE_KEY);
}

// User type
interface AuthUser {
  name?: string;
  email?: string;
  sub?: string;
  [key: string]: unknown;
}

// Return type for the hook
export interface UseAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: () => Promise<void>;
  logout: () => void;
  getAccessToken: () => Promise<string | undefined>;
}

/**
 * Unified auth hook that handles both web (Auth0 SDK) and mobile (native ASWebAuthenticationSession)
 */
export function useAuth(): UseAuthReturn {
  // Check platform once on mount
  const [isMobileDevice, setIsMobileDevice] = useState<boolean | null>(null);

  // Mobile auth state
  const [mobileState, setMobileState] = useState({
    isAuthenticated: false,
    isLoading: true,
    user: null as AuthUser | null,
  });

  // Get Auth0 hook (will be used on web, ignored on mobile)
  const auth0 = useAuth0();

  // Determine if we're on mobile after mount (Tauri needs to be ready)
  useEffect(() => {
    // Small delay to ensure Tauri is initialized
    const timer = setTimeout(() => {
      try {
        const mobile = isMobile();
        console.log('[useAuth] Platform detection - isMobile:', mobile);
        setIsMobileDevice(mobile);
      } catch (err) {
        console.warn('[useAuth] Platform detection failed, assuming web:', err);
        setIsMobileDevice(false);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Initialize mobile auth state from stored tokens
  useEffect(() => {
    if (isMobileDevice !== true) return;

    const tokens = getStoredTokens();
    if (tokens && tokens.expires_at > Date.now()) {
      const payload = parseJwt(tokens.id_token);
      if (payload) {
        console.log('[useAuth] Restored mobile session for:', payload.email);
        setMobileState({
          isAuthenticated: true,
          isLoading: false,
          user: { name: payload.name, email: payload.email, sub: payload.sub },
        });
        return;
      }
    }
    setMobileState({ isAuthenticated: false, isLoading: false, user: null });
  }, [isMobileDevice]);

  // Login function
  const login = useCallback(async () => {
    if (isMobileDevice !== true) {
      // Web: use Auth0 redirect
      return auth0.loginWithRedirect();
    }

    // Mobile: use ASWebAuthenticationSession
    console.log('[useAuth] Starting mobile login flow');
    setMobileState(prev => ({ ...prev, isLoading: true }));

    try {
      const { verifier, challenge } = await generatePKCE();
      const state = generateRandomString(32);

      const authUrl = new URL(`https://${AUTH0_DOMAIN}/authorize`);
      authUrl.searchParams.set('client_id', AUTH0_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', MOBILE_CALLBACK_URL);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'openid profile email offline_access');
      authUrl.searchParams.set('audience', AUTH0_AUDIENCE);
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('prompt', 'login'); // Always show login screen

      console.log('[useAuth] Opening ASWebAuthenticationSession...');
      const result = await authenticate({
        authUrl: authUrl.toString(),
        callbackScheme: CALLBACK_SCHEME,
      });

      if (!result.success || !result.token) {
        throw new Error(result.error || 'Authentication cancelled');
      }

      // Parse callback URL
      const callbackUrl = new URL(result.token);

      // Verify state
      if (callbackUrl.searchParams.get('state') !== state) {
        throw new Error('State mismatch - possible CSRF attack');
      }

      const code = callbackUrl.searchParams.get('code');
      if (!code) {
        throw new Error('No authorization code received');
      }

      // Exchange code for tokens
      console.log('[useAuth] Exchanging code for tokens...');
      const tokenResponse = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: AUTH0_CLIENT_ID,
          code,
          code_verifier: verifier,
          redirect_uri: MOBILE_CALLBACK_URL,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        throw new Error(`Token exchange failed: ${errorData.error_description || tokenResponse.statusText}`);
      }

      const tokens = await tokenResponse.json();
      storeTokens(tokens);

      const payload = parseJwt(tokens.id_token);
      console.log('[useAuth] Mobile login successful for:', payload?.email);

      setMobileState({
        isAuthenticated: true,
        isLoading: false,
        user: payload ? { name: payload.name, email: payload.email, sub: payload.sub } : null,
      });
    } catch (err) {
      console.error('[useAuth] Mobile login failed:', err);
      setMobileState({ isAuthenticated: false, isLoading: false, user: null });
      throw err;
    }
  }, [isMobileDevice, auth0]);

  // Logout function
  const logout = useCallback(() => {
    if (isMobileDevice) {
      console.log('[useAuth] Mobile logout - clearing tokens');
      clearStoredTokens();
      setMobileState({ isAuthenticated: false, isLoading: false, user: null });
    } else {
      auth0.logout({ logoutParams: { returnTo: window.location.origin } });
    }
  }, [isMobileDevice, auth0]);

  // Get access token function
  const getAccessToken = useCallback(async (): Promise<string | undefined> => {
    if (isMobileDevice !== true) {
      // Web: use Auth0
      try {
        return await auth0.getAccessTokenSilently({
          authorizationParams: { audience: AUTH0_AUDIENCE },
        });
      } catch {
        return undefined;
      }
    }

    // Mobile: get from storage, refresh if needed
    const tokens = getStoredTokens();
    if (!tokens) return undefined;

    // If token expires in < 5 min, try refresh
    if (tokens.expires_at < Date.now() + 5 * 60 * 1000 && tokens.refresh_token) {
      try {
        console.log('[useAuth] Refreshing mobile token...');
        const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'refresh_token',
            client_id: AUTH0_CLIENT_ID,
            refresh_token: tokens.refresh_token,
          }),
        });

        if (response.ok) {
          const newTokens = await response.json();
          storeTokens({
            ...newTokens,
            refresh_token: newTokens.refresh_token || tokens.refresh_token,
          });
          return newTokens.access_token;
        }
      } catch (err) {
        console.error('[useAuth] Token refresh failed:', err);
      }
    }

    return tokens.access_token;
  }, [isMobileDevice, auth0]);

  // Return unified interface
  // While still determining platform, show loading
  if (isMobileDevice === null) {
    return {
      isAuthenticated: false,
      isLoading: true,
      user: null,
      login,
      logout,
      getAccessToken,
    };
  }

  if (isMobileDevice) {
    return {
      isAuthenticated: mobileState.isAuthenticated,
      isLoading: mobileState.isLoading,
      user: mobileState.user,
      login,
      logout,
      getAccessToken,
    };
  }

  // Web: return Auth0 state
  return {
    isAuthenticated: auth0.isAuthenticated,
    isLoading: auth0.isLoading,
    user: auth0.user as AuthUser | null,
    login,
    logout,
    getAccessToken,
  };
}

/**
 * Mock auth hook for local development when Auth0 is disabled
 */
export function useMockAuth(): UseAuthReturn {
  return useMemo(() => ({
    isAuthenticated: false,
    isLoading: false,
    user: { name: 'Local Dev User', email: 'dev@local.host' },
    login: async () => { console.log('[MockAuth] Login called'); },
    logout: () => { console.log('[MockAuth] Logout called'); },
    getAccessToken: async () => 'mock_token',
  }), []);
}
