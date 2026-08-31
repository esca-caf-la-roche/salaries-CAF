import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.112.4";
import { HttpError } from "./http.ts";

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variable serveur manquante: ${name}`);
  return value;
}

function firstNamedKey(jsonName: string, legacyName: string): string {
  const dictionary = Deno.env.get(jsonName);
  if (dictionary) {
    const values = Object.values(JSON.parse(dictionary)) as string[];
    if (values[0]) return values[0];
  }
  return required(legacyName);
}

export function adminClient(): SupabaseClient {
  return createClient(
    required("SUPABASE_URL"),
    firstNamedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function requireAdmin(req: Request): Promise<{ user: User; admin: SupabaseClient }> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "Authentification requise");
  const admin = adminClient();
  const { data: { user }, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !user) throw new HttpError(401, "Session invalide");
  const { data: profile, error: profileError } = await admin
    .from("profiles").select("role,active").eq("id", user.id).single();
  if (profileError || profile?.role !== "admin" || !profile.active) {
    throw new HttpError(403, "Accès administrateur requis");
  }
  return { user, admin };
}
