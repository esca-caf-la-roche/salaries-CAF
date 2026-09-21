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
    const googleAccountEmail = userInfo.email ?? null;

    // Connexion Google partagée : une seule connexion active pour toute l'association.
    // Si une connexion existe déjà, seule la même adresse Google peut être reconnectée.
    const { data: existing, error: existingError } = await admin.from("google_connections")
      .select("id,google_account_email").is("revoked_at", null)
      .order("connected_at", { ascending: true }).limit(1).maybeSingle();
    if (existingError) throw existingError;
    if (existing && googleAccountEmail &&
        String(existing.google_account_email ?? "").trim().toLowerCase() !== googleAccountEmail.trim().toLowerCase()) {
      return redirect(fallback, { google: "error", reason: "google_account_already_connected" });
    }

    let connectionId: string;
    if (existing) {
      const { error: updateError } = await admin.from("google_connections")
        .update({ google_account_email: googleAccountEmail, scopes, updated_at: now })
        .eq("id", existing.id);
      if (updateError) throw updateError;
      connectionId = existing.id;
    } else {
      const { data: created, error: insertError } = await admin.from("google_connections")
        .insert({ owner_id: oauthState.owner_id, google_account_email: googleAccountEmail, scopes })
        .select("id").single();
      if (insertError) throw insertError;
      connectionId = created.id;
    }
    // Sécurité : une seule connexion active est conservée.
    await admin.from("google_connections")
      .update({ revoked_at: now }).is("revoked_at", null).neq("id", connectionId);
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;
    const { error: credentialsError } = await admin.rpc("internal_upsert_google_credentials", {
      p_connection_id: connectionId, p_access_token: tokens.access_token,
      p_refresh_token: tokens.refresh_token ?? null, p_token_type: tokens.token_type ?? "Bearer", p_expires_at: expiresAt,
    });
    if (credentialsError) throw credentialsError;
    return redirect(oauthState.redirect_to, { google: "connected" });
  } catch (error) {
    console.error(error);
    return redirect(fallback, { google: "error", reason: "callback_failed" });
  }
});
