import { corsHeaders, errorResponse, HttpError, json } from "../_shared/http.ts";
import { GOOGLE_SCOPE, oauthConfig, sha256 } from "../_shared/google.ts";
import { requireAdmin } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Méthode non autorisée");
    const { user, admin } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const redirectTo = String(body.redirectTo ?? Deno.env.get("FRONTEND_ORIGIN") ?? "http://localhost:5173");
    const allowedOrigin = new URL(Deno.env.get("FRONTEND_ORIGIN") ?? "http://localhost:5173").origin;
    if (new URL(redirectTo).origin !== allowedOrigin) throw new HttpError(400, "URL de retour non autorisée");

    const state = crypto.randomUUID() + crypto.randomUUID();
    const { error } = await admin.from("google_oauth_states").insert({
      state_hash: await sha256(state), owner_id: user.id, redirect_to: redirectTo,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (error) throw error;

    const config = oauthConfig();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code",
      scope: GOOGLE_SCOPE, access_type: "offline", include_granted_scopes: "true",
      prompt: "consent", state,
    }).toString();
    return json({ authorizationUrl: url.toString() });
  } catch (error) {
    return errorResponse(error);
  }
});
