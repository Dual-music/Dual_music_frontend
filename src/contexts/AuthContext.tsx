/**
 * Authentication context — the single source of truth for the signed-in user,
 * replacing the former Supabase auth client.
 *
 * On mount it hydrates from a persisted refresh token (calls `/auth/me`). It
 * exposes imperative `signIn`/`signUp`/`signOut` plus reactive `user`, `profile`,
 * `roles`, and role helpers. Token persistence lives in {@link module:api/tokens};
 * this context only mirrors it into React state and drives navigation-independent
 * re-renders.
 *
 * @module contexts/AuthContext
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import * as authApi from "@/api/endpoints/auth";
import type {
  AuthUser,
  MeResponse,
  Profile,
  RegisterInput,
  UserRole,
} from "@/api/endpoints/auth";
import {
  clearTokens,
  getRefreshToken,
  onTokensChanged,
  setTokens,
} from "@/api/tokens";

interface AuthContextValue {
  user: AuthUser | null;
  profile: Profile | null;
  roles: UserRole[];
  /** True once the initial session hydration has settled. */
  ready: boolean;
  /** True while an auth request (hydrate/login/signup) is in flight. */
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasRole: (role: UserRole) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  /** Re-fetches `/auth/me` (e.g. after a role/profile change). */
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const applyMe = useCallback((data: MeResponse) => {
    setUser(data.user);
    setProfile(data.profile ?? null);
    setRoles(data.roles ?? []);
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setProfile(null);
    setRoles([]);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const data = await authApi.me();
      if (mounted.current) applyMe(data);
    } catch {
      clearTokens();
      if (mounted.current) clearSession();
    }
  }, [applyMe, clearSession]);

  // Initial hydration from a persisted refresh token.
  useEffect(() => {
    mounted.current = true;
    (async () => {
      if (!getRefreshToken()) {
        setLoading(false);
        setReady(true);
        return;
      }
      await refreshMe();
      if (mounted.current) {
        setLoading(false);
        setReady(true);
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [refreshMe]);

  // React to out-of-band token clears (e.g. a failed background refresh).
  useEffect(
    () =>
      onTokensChanged((tokens) => {
        if (!tokens && mounted.current) clearSession();
      }),
    [clearSession],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      try {
        const session = await authApi.login(email, password);
        setTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken });
        applyMe({ user: session.user, profile: session.profile ?? null, roles: session.roles });
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [applyMe],
  );

  const signUp = useCallback(
    async (input: RegisterInput) => {
      setLoading(true);
      try {
        const session = await authApi.register(input);
        setTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken });
        applyMe({ user: session.user, profile: session.profile ?? null, roles: session.roles });
        return session.user;
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [applyMe],
  );

  const signOut = useCallback(async () => {
    const token = getRefreshToken();
    try {
      await authApi.logout(token);
    } catch {
      /* best-effort; clear locally regardless */
    }
    clearTokens();
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      roles,
      ready,
      loading,
      isAuthenticated: !!user,
      isAdmin: roles.includes("admin"),
      hasRole: (role: UserRole) => roles.includes(role),
      signIn,
      signUp,
      signOut,
      refreshMe,
    }),
    [user, profile, roles, ready, loading, signIn, signUp, signOut, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Accesses the auth context. Throws if used outside {@link AuthProvider}. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an <AuthProvider>");
  return ctx;
}

export default AuthContext;
