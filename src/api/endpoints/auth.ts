/**
 * Auth endpoints — thin typed wrappers over `/auth/*`.
 *
 * Mirrors `auth.routes.js`. Login/register return the user, profile, roles and a
 * token pair; the {@link module:api/tokens} store is updated by the caller
 * (`AuthContext`) so token side-effects stay in one place.
 *
 * @module api/endpoints/auth
 */

import { http } from "../http";
import type { AuthTokens } from "../tokens";

export type UserRole = "fan" | "artist" | "manager" | "admin" | "moderator";

export interface AuthUser {
  id: string;
  email: string;
  phone: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  isBanned: boolean;
}

/** Profile row (snake_case, as stored) — kept loose during migration. */
export type Profile = Record<string, unknown> & {
  id: string;
  display_name?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  referral_code?: string | null;
};

export interface AuthSession extends AuthTokens {
  user: AuthUser;
  profile?: Profile | null;
  roles: UserRole[];
  expiresIn: number;
  tokenType: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName?: string;
  phone?: string | null;
  countryCode?: string;
  phoneCountryCode?: string;
  referralCode?: string | null;
}

/** POST /auth/register */
export function register(input: RegisterInput): Promise<AuthSession> {
  return http.post<AuthSession>("/auth/register", input, { anonymous: true });
}

/** POST /auth/login */
export function login(email: string, password: string): Promise<AuthSession> {
  return http.post<AuthSession>("/auth/login", { email, password }, { anonymous: true });
}

/** POST /auth/refresh */
export function refresh(refreshToken: string): Promise<AuthSession> {
  return http.post<AuthSession>("/auth/refresh", { refreshToken }, { anonymous: true });
}

/** POST /auth/logout */
export function logout(refreshToken?: string | null): Promise<{ success: boolean }> {
  return http.post("/auth/logout", { refreshToken });
}

export interface MeResponse {
  user: AuthUser;
  profile: Profile | null;
  roles: UserRole[];
}

/** GET /auth/me */
export function me(): Promise<MeResponse> {
  return http.get<MeResponse>("/auth/me");
}

/** POST /auth/password/forgot */
export function forgotPassword(email: string): Promise<{ sent: boolean }> {
  return http.post("/auth/password/forgot", { email }, { anonymous: true });
}

/** POST /auth/password/reset */
export function resetPassword(input: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<{ reset: boolean }> {
  return http.post("/auth/password/reset", input, { anonymous: true });
}

/**
 * POST /auth/otp/email/send — (ré)envoie le code de vérification à l'email du caller.
 * Requiert un Bearer (l'utilisateur vient d'être créé/connecté à l'inscription).
 */
export function sendEmailOtp(): Promise<{ sent: boolean }> {
  return http.post("/auth/otp/email/send", {});
}

/** POST /auth/otp/email/verify — vérifie le code reçu par email. */
export function verifyEmailOtp(code: string): Promise<{ verified: boolean }> {
  return http.post("/auth/otp/email/verify", { code });
}

/** POST /auth/password/change */
export function changePassword(
  newPassword: string,
  currentPassword?: string,
): Promise<{ changed: boolean }> {
  return http.post("/auth/password/change", { currentPassword, newPassword });
}
