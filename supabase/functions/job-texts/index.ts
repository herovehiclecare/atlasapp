import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Job texts: "you're booked", day-before reminder, review request.
//   {mode:"send", jobId, type}  - owner-triggered from the app (needs the user's JWT + membership)
//   {mode:"sweep"}              - called hourly by pg_cron; only sends what is due and not yet sent
// Sweep is safe to leave unauthenticated: it is idempotent (sent_at flags) and only texts
// businesses whose owner switched that automation on AND where texting_enabled is true.
// Texts go out from the single QUO number configured for this project (known per-tenant gap).

const QUO_API_KEY = Deno.env.get("QUO_API_KEY") || "";
const QUO_FROM_NUMBER = Deno.env.get("QUO_FROM_NUMBER") || "";
const TZ = "America/New_York";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

function toE164(raw: string | null | undefined): string | null {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

function whenParts(iso: string) {
  const d = new Date(iso);
  return {
    date: new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ }).format(d),
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(d),
  };
}

function buildText(type: string, job: any, reviewLink: string): string {
  const first = (job.customers?.name || "").split(" ")[0] || "there";
  const biz = job.businesses?.name || "your detailer";
  const vehicle = job.vehicles?.label || "your vehicle";
  const { date, time } = whenParts(job.scheduled_at);
  if (type === "scheduled") return `Hi ${first}, you're booked with ${biz} for ${vehicle} on ${date} at ${time}. Reply here if anything changes. Reply STOP to opt out.`;
  if (type === "reminder") return `Hi ${first}, reminder: ${biz} is scheduled for ${vehicle} on ${date} at ${time}. Reply here if you need to reschedule. Reply STOP to opt out.`;
  return `Hi ${first}, thanks for choosing ${biz}! If you're happy with the work, a quick review helps a lot: ${reviewLink} Reply STOP to opt out.`;
}

const COLUMN: Record<string, string> = { scheduled: "confirmation_sent_at", reminder: "reminder_sent_at", review: "review_sent_at" };

async function sendOne(type: string, job: any, reviewLink: string): Promise<{ ok: boolean; error?: string }> {
  const to = toE164(job.customers?.phone);
  if (!to) return { ok: false, error: "This customer has no usable phone number." };
  if (!job.businesses?.texting_enabled) return { ok: false, error: "Texting isn't set up for this business yet." };
  if (type === "review" && !reviewLink) return { ok: false, error: "Add your review link in Settings → Automations first." };
  try {
    const res = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: QUO_API_KEY },
      body: JSON.stringify({ content: buildText(type, job, reviewLink), from: QUO_FROM_NUMBER, to: [to] }),
    });
    if (!res.ok) {
      console.error("job text failed", type, res.status, await res.text());
      return { ok: false, error: "The text didn't go through." };
    }
  } catch (err) {
    console.error("job text threw", err);
    return { ok: false, error: "The text didn't go through." };
  }
  await supabase.from("jobs").update({ [COLUMN[type]]: new Date().toISOString() }).eq("id", job.id);
  return { ok: true };
}

const JOB_SELECT = "id, business_id, status, scheduled_at, confirmation_sent_at, reminder_sent_at, review_sent_at, completed_at, customers(name, phone), vehicles(label), businesses(name, texting_enabled, ui_prefs)";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Not found", { status: 404 });
  if (!QUO_API_KEY || !QUO_FROM_NUMBER) return json({ error: "Texting isn't set up yet." }, 400);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  if (body.mode === "send") {
    const type = String(body.type || "");
    if (!COLUMN[type]) return json({ error: "Unknown text type" }, 400);
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Not signed in." }, 401);
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) return json({ error: "Not signed in." }, 401);

    const { data: job } = await supabase.from("jobs").select(JOB_SELECT).eq("id", body.jobId).maybeSingle();
    if (!job) return json({ error: "Job not found" }, 404);
    const { data: membership } = await supabase.from("business_members").select("business_id").eq("business_id", job.business_id).eq("user_id", userData.user.id).maybeSingle();
    if (!membership) return json({ error: "Not authorized for this job." }, 403);

    const reviewLink = job.businesses?.ui_prefs?.automations?.reviewLink || "";
    const r = await sendOne(type, job, reviewLink);
    return r.ok ? json({ success: true }) : json({ error: r.error }, 400);
  }

  if (body.mode === "sweep") {
    const now = new Date();
    const localHour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: TZ }).format(now)) % 24;
    const quietHours = localHour < 8 || localHour >= 20;
    const sent = { reminder: 0, review: 0 };

    if (!quietHours) {
      const horizon = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
      const { data: due } = await supabase.from("jobs").select(JOB_SELECT)
        .eq("status", "scheduled").is("reminder_sent_at", null)
        .gt("scheduled_at", new Date(now.getTime() + 2 * 3600 * 1000).toISOString()).lte("scheduled_at", horizon);
      for (const job of due || []) {
        if (!job.businesses?.texting_enabled || !job.businesses?.ui_prefs?.automations?.dayBefore) continue;
        // A booking text went out in the last 12h - the reminder would just be a duplicate.
        if (job.confirmation_sent_at && now.getTime() - new Date(job.confirmation_sent_at).getTime() < 12 * 3600 * 1000) continue;
        const r = await sendOne("reminder", job, "");
        if (r.ok) sent.reminder++;
      }

      const { data: done } = await supabase.from("jobs").select(JOB_SELECT)
        .eq("status", "completed").is("review_sent_at", null).not("completed_at", "is", null)
        .lte("completed_at", new Date(now.getTime() - 2 * 3600 * 1000).toISOString())
        .gte("completed_at", new Date(now.getTime() - 3 * 24 * 3600 * 1000).toISOString());
      for (const job of done || []) {
        const a = job.businesses?.ui_prefs?.automations;
        if (!job.businesses?.texting_enabled || !a?.review || !a?.reviewLink) continue;
        const r = await sendOne("review", job, a.reviewLink);
        if (r.ok) sent.review++;
      }
    }
    return json({ success: true, quietHours, sent });
  }

  return json({ error: "Unknown mode" }, 400);
});
