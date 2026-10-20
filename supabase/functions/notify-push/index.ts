import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Sends a phone notification (Web Push) to every device a business owner turned
// notifications on for. Called server-to-server by the lead functions with the
// service-role key; never by a browser.

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (req.headers.get("authorization") !== `Bearer ${SERVICE_KEY}`) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const businessId = String(body?.business_id || "");
  if (!businessId) return json({ error: "Missing business_id" }, 400);

  const { data: cfg } = await supabase.from("push_config").select("public_key, private_key, subject").eq("id", 1).maybeSingle();
  if (!cfg) return json({ sent: 0, reason: "push not configured" });
  webpush.setVapidDetails(cfg.subject, cfg.public_key, cfg.private_key);

  const { data: subs } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("business_id", businessId);
  if (!subs?.length) return json({ sent: 0 });

  const { count } = await supabase.from("customers").select("id", { count: "exact", head: true })
    .eq("business_id", businessId).eq("lead_stage", "new");

  const payload = JSON.stringify({
    title: String(body.title || "Atlas").slice(0, 80),
    body: String(body.body || "").slice(0, 240),
    url: String(body.url || "/"),
    tag: String(body.tag || "atlas-lead"),
    badge: count ?? 0,
  });

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "high" });
      sent++;
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.id);
      else console.error("push failed", err?.statusCode, err?.body);
    }
  }));
  if (dead.length) await supabase.from("push_subscriptions").delete().in("id", dead);
  return json({ sent, removed: dead.length });
});
