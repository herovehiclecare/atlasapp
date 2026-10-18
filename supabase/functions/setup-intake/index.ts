import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Atlas setup intake - the form a new Instant Quote customer fills out before onboarding.
// POST JSON -> one row in setup_requests, plus a text to the owner.

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const QUO_API_KEY = Deno.env.get("QUO_API_KEY") || "";
const QUO_FROM_NUMBER = Deno.env.get("QUO_FROM_NUMBER") || "";
const OWNER_ALERT_PHONE = Deno.env.get("OWNER_ALERT_PHONE") || "";
const MAX_PER_HOUR = 15;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
const clean = (s: unknown, max = 200) => String(s ?? "").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, authorization, apikey",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

    // Hidden field a person never fills in; a bot usually does.
    if (clean(body?.website_url_hp)) return json({ ok: true });

    const business = clean(body?.business_name, 120);
    const contact = clean(body?.contact_name, 120);
    const phone = clean(body?.phone, 40);
    const email = clean(body?.email, 160);
    if (business.length < 2) return json({ error: "Please add your business name." }, 422);
    if (contact.length < 2) return json({ error: "Please add your name." }, 422);
    if (!phone && !email) return json({ error: "Please add a phone number or an email." }, 422);

    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await supabase.from("setup_requests").select("id", { count: "exact", head: true }).gte("created_at", hourAgo);
    if ((count ?? 0) >= MAX_PER_HOUR) return json({ error: "Too many requests right now. Please email us instead." }, 429);

    const data = {
      trade: clean(body?.trade, 80),
      website: clean(body?.website, 200),
      website_platform: clean(body?.website_platform, 60),
      service_area: clean(body?.service_area, 200),
      services: clean(body?.services, 4000),
      add_ons: clean(body?.add_ons, 1500),
      reply_window: clean(body?.reply_window, 80),
      alert_phone: clean(body?.alert_phone, 40),
      brand_color: clean(body?.brand_color, 40),
      socials: clean(body?.socials, 400),
      notes: clean(body?.notes, 2000),
    };

    const { error } = await supabase.from("setup_requests").insert({
      business_name: business, contact_name: contact, phone: phone || null, email: email || null, data,
    });
    if (error) {
      console.error("setup-intake insert failed", error.message);
      return json({ error: "Could not save that. Please email us instead." }, 500);
    }

    if (QUO_API_KEY && QUO_FROM_NUMBER && OWNER_ALERT_PHONE) {
      try {
        const res = await fetch("https://api.openphone.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: QUO_API_KEY },
          body: JSON.stringify({
            content: `New Atlas setup form: ${business} (${contact}${phone ? ` ${phone}` : ""}). Open setup_requests to start onboarding.`.slice(0, 300),
            from: QUO_FROM_NUMBER,
            to: [OWNER_ALERT_PHONE],
          }),
        });
        if (!res.ok) console.error("setup-intake alert failed", res.status, await res.text());
      } catch (err) {
        console.error("setup-intake alert threw", err);
      }
    }

    return json({ ok: true });
  } catch (err) {
    console.error("setup-intake failed", err);
    return json({ error: "Something went wrong. Please email us instead." }, 500);
  }
});
