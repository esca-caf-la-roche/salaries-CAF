import { exchangeCode, sha256 } from "../_shared/google.ts";
import { adminClient } from "../_shared/supabase.ts";

function redirect(base: string, params: Record<string, string>) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return Response.redirect(url, 302);
}

Deno.serve(async (req) => {
  const fallback = Deno.env.get("FRONTEND_ORIGIN") ?? "http://localhost:5173";
  try {
    const requestUrl = new URL(req.url);
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    if (!code || !state) return redirect(fallback, { google: "error", reason: "missing_code_or_state" });

    const admin = adminClient();
    const now = new Date().toISOString();
    const { data: oauthState, error: stateError } = await admin.from("google_oauth_states")
      .select("state_hash,owner_id,redirect_to,expires_at,used_at")
      .eq("state_hash", await sha256(state)).is("used_at", null).gt("expires_at", now).single();
    if (stateError || !oauthState) return redirect(fallback, { google: "error", reason: "invalid_state" });

    // Consommation atomique: un deuxième callback ne peut plus utiliser le même state.
    const { data: consumed, error: consumeError } = await admin.from("google_oauth_states")
      .update({ used_at: now }).eq("state_hash", oauthState.state_hash).is("used_at", null)
      .select("state_hash").maybeSingle();
    if (consumeError || !consumed) return redirect(fallback, { google: "error", reason: "state_already_used" });

    const tokens = await exchangeCode(code);
    const userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = userInfoResponse.ok ? await userInfoResponse.json() : {};
    const scopes = (tokens.scope ?? "").split(" ").filter(Boolean);
    const { data: connection, error: connectionError } = await admin.from("google_connections")
      .upsert({ owner_id: oauthState.owner_id, google_account_email: userInfo.email ?? null, scopes, revoked_at: null }, { onConflict: "owner_id" })
      .select("id").single();
    if (connectionError) throw connectionError;
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;
    const { error: credentialsError } = await admin.rpc("internal_upsert_google_credentials", {
      p_connection_id: connection.id, p_access_token: tokens.access_token,
      p_refresh_token: tokens.refresh_token ?? null, p_token_type: tokens.token_type ?? "Bearer", p_expires_at: expiresAt,
    });
    if (credentialsError) throw credentialsError;
    return redirect(oauthState.redirect_to, { google: "connected" });
  } catch (error) {
    console.error(error);
    return redirect(fallback, { google: "error", reason: "callback_failed" });
  }
});
