import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, errorResponse, HttpError, json } from "../_shared/http.ts";
import { requireActiveUser } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Méthode non autorisée");
    const { user, role, admin } = await requireActiveUser(req);
    const body = await req.json().catch(() => ({}));
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("VALIDATION_ALERT_FROM_EMAIL");
    if (!apiKey || !from) throw new HttpError(503, "Service d’alerte mail non configuré");

    let candidates: Array<Record<string, unknown>> = [];
    if (body.dispatchPending === true) {
      if (role !== "admin") throw new HttpError(403, "Accès administrateur requis");
      const { data, error } = await admin.from("validation_email_outbox").select("id,recipient_email,subject,body,sent_at,attempts")
        .is("sent_at", null).order("created_at").limit(10);
      if (error) throw error;
      candidates = data ?? [];
    } else {
      const employeeId = String(body.employeeId ?? "");
      const schoolYear = Number(body.schoolYear);
      const month = Number(body.month);
      if (!employeeId || !Number.isInteger(schoolYear) || !Number.isInteger(month)) throw new HttpError(400, "Période invalide");
      let eventQuery = admin.from("monthly_validation_events")
        .select("id,actor_id,event_type,validation_email_outbox(id,recipient_email,subject,body,sent_at,attempts)")
        .eq("employee_id", employeeId).eq("school_year", schoolYear).eq("month", month)
        .eq("event_type", "employee_validated").order("occurred_at", { ascending: false }).limit(1);
      if (role !== "admin") eventQuery = eventQuery.eq("actor_id", user.id);
      const { data: events, error } = await eventQuery;
      if (error) throw error;
      const embedded = events?.[0]?.validation_email_outbox;
      const outbox = Array.isArray(embedded) ? embedded[0] : embedded;
      if (outbox) candidates = [outbox];
    }

    let sent = 0;
    for (const candidate of candidates) {
      if (candidate.sent_at) continue;
      const now = new Date().toISOString();
      const leaseExpiry = new Date(Date.now() - 10 * 60_000).toISOString();
      const { data: outbox, error: claimError } = await admin.from("validation_email_outbox")
        .update({ processing_started_at: now }).eq("id", candidate.id).is("sent_at", null)
        .or(`processing_started_at.is.null,processing_started_at.lt.${leaseExpiry}`)
        .select("id,recipient_email,subject,body,attempts").maybeSingle();
      if (claimError) throw claimError;
      if (!outbox) continue;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `validation-${outbox.id}` },
        body: JSON.stringify({ from, to: [outbox.recipient_email], subject: outbox.subject, text: outbox.body }),
      });
      const responseBody = await response.text();
      if (!response.ok) {
        await admin.from("validation_email_outbox").update({ attempts: Number(outbox.attempts ?? 0) + 1, processing_started_at: null, last_error: `Resend ${response.status}: ${responseBody.slice(0, 300)}` }).eq("id", outbox.id).is("sent_at", null);
        continue;
      }
      await admin.from("validation_email_outbox").update({ sent_at: new Date().toISOString(), processing_started_at: null, attempts: Number(outbox.attempts ?? 0) + 1, last_error: null }).eq("id", outbox.id).is("sent_at", null);
      sent += 1;
    }
    return json({ status: candidates.length ? "processed" : "not_configured", sent });
  } catch (error) {
    return errorResponse(error);
  }
});
