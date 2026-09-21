// FRONTEND_ORIGIN peut contenir un chemin (ex. GitHub Pages /salaries-CAF) pour les
// redirections OAuth ; l'en-tête CORS, lui, n'accepte que l'origine seule.
const frontendOrigin = (() => {
  const value = Deno.env.get("FRONTEND_ORIGIN");
  if (!value) return "http://localhost:5173";
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
})();

export const corsHeaders = {
  "Access-Control-Allow-Origin": frontendOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Erreur interne";
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) console.error(error);
  return json({ error: message }, status);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
