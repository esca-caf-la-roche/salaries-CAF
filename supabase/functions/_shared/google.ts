import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";
import { HttpError } from "./http.ts";

export const GOOGLE_SCOPE = "openid email https://www.googleapis.com/auth/calendar.readonly";

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variable serveur manquante: ${name}`);
  return value;
}

export function oauthConfig() {
  return {
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"),
    redirectUri: required("GOOGLE_REDIRECT_URI"),
  };
}

export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function exchangeCode(code: string) {
  const config = oauthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new HttpError(502, `Échange OAuth Google refusé: ${payload.error ?? response.status}`);
  return payload as { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string };
}

export async function getAccessToken(admin: SupabaseClient, connectionId: string): Promise<string> {
  const { data, error } = await admin.rpc("internal_get_google_credentials", { p_connection_id: connectionId });
  if (error || !data?.[0]) throw new HttpError(409, "Connexion Google absente");
  const credentials = data[0] as { access_token: string; refresh_token: string | null; expires_at: string | null; token_type: string };
  if (credentials.expires_at && Date.parse(credentials.expires_at) > Date.now() + 60_000) return credentials.access_token;
  if (!credentials.refresh_token) throw new HttpError(409, "Google doit être reconnecté (refresh token absent)");

  const config = oauthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: credentials.refresh_token,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new HttpError(response.status === 400 ? 409 : 502, `Renouvellement Google refusé: ${payload.error ?? response.status}`);
  const expiresAt = new Date(Date.now() + Number(payload.expires_in ?? 3600) * 1000).toISOString();
  const { error: saveError } = await admin.rpc("internal_upsert_google_credentials", {
    p_connection_id: connectionId,
    p_access_token: payload.access_token,
    p_refresh_token: null,
    p_token_type: payload.token_type ?? credentials.token_type,
    p_expires_at: expiresAt,
  });
  if (saveError) throw saveError;
  return payload.access_token;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return Math.min(dateDelay, 30_000);
  }
  const exponential = Math.min(500 * 2 ** attempt, 8_000);
  return exponential + Math.floor(Math.random() * Math.max(100, exponential * 0.25));
}

export async function googleFetch(url: URL, accessToken: string): Promise<Response> {
  const retryable = new Set([429, 500, 502, 503, 504]);
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      lastResponse = response;
      if (!retryable.has(response.status) || attempt === 4) return response;
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
    } catch (error) {
      if (attempt === 4) throw error;
      const exponential = Math.min(500 * 2 ** attempt, 8_000);
      await new Promise((resolve) => setTimeout(resolve, exponential + Math.floor(Math.random() * 250)));
    }
  }
  if (lastResponse) return lastResponse;
  throw new HttpError(502, "Google API indisponible après plusieurs tentatives");
}
