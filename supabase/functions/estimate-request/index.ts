import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Atlas Instant Quote - the public page a business links from its website.
//
// GET  ?slug=<estimate_slug>  -> that business's saved quote-tool setup (businesses.estimate_config)
// GET  ?slug=<slug>&logo=1    -> that business's logo image (cacheable)
// POST                        -> records one request as a lead (customer + follow-up)
//
// The page itself is static and served by Vercel (public/estimate). This function only speaks JSON.
//
// The browser sends *selections* (service names, size/condition ids), never prices. Every figure
// on the lead is recomputed here from the business's saved setup, so a customer can't post
// their own total.

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const OPENPHONE_API_KEY = Deno.env.get("QUO_API_KEY") || "";
const OPENPHONE_FROM_NUMBER = Deno.env.get("QUO_FROM_NUMBER") || "";
const OWNER_ALERT_PHONE = Deno.env.get("OWNER_ALERT_PHONE") || "";
// Texts go out from the Atlas number, so only Andre's own business (ATLAS_BUSINESS_ID) may send them.
const ALERT_BUSINESS_ID = Deno.env.get("ATLAS_BUSINESS_ID") || "";
const MAX_ALERTS_PER_HOUR = 10;

const DEDUPE_WINDOW_MINUTES = 10;
const MAX_ITEMS = 6;
const MAX_PICKS = 20;
const MAX_PER_MINUTE = 20;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...extra },
  });

// The logo is stored inside the setup as a big base64 image. Sending it with every page load made
// the config ~78KB, so the page serves it from its own cacheable address instead.
const hashStr = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

// Warm instances answer repeat page loads from memory for 30 seconds, so edits still show up quickly.
const cfgCache = new Map<string, { t: number; body: string }>();

const round5 = (n: number) => Math.round(n / 5) * 5;
const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
const clean = (s: unknown, max = 200) => String(s ?? "").trim().slice(0, max);
const rangeText = (low: number, high: number, open: boolean) =>
  open && low === high ? `from ${money(low)}` : low === high ? money(low) : `${money(low)} - ${money(high)}${open ? "+" : ""}`;

const ownerRange = (low: number, high: number) =>
  low === high ? money(low) : `${money(low)} - ${money(high)} (middle ~${money(round5((low + high) / 2))})`;

// Same maths as the page (app.js priceFor): condition picks the spot inside the business's own
// low-high band; the timing question only ever lifts the top; a blank high means "from $X"; equal low and high is a flat price.
function priceFor(svc: any, sizeId: string, cond: any, freq: any) {
  // Vehicle-type services (boat, RV, motorcycle...) show the owner's price exactly as written.
  if (svc.type) {
    const b = svc.car || [0, null];
    const lo = Number(b[0]) || 0;
    if (b[1] == null || b[1] === "") return { low: lo, high: lo, open: true };
    const hi = Number(b[1]) || lo;
    return { low: Math.min(lo, hi), high: Math.max(lo, hi), open: false };
  }
  const band = (sizeId === "suv" ? svc.suv : svc.car) || [0, null];
  const low = Number(band[0]) || 0;
  const rawHigh = band[1];
  const lo = Number(cond?.lo) || 0;
  const hi = cond?.hi == null ? 1 : Number(cond.hi) || 0;
  const up = (Number(freq?.uplift) || 0) / 100;
  if (rawHigh == null || rawHigh === "") {
    return { low: round5(low), high: round5(low + low * (hi * 0.18 + up)), open: true };
  }
  const high = Number(rawHigh) || low;
  if (high === low) return { low, high, open: false };
  const spread = Math.max(0, high - low);
  return { low: round5(low + spread * lo), high: round5((low + spread * hi) * (1 + up)), open: false };
}

async function loadBusiness(slug: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, estimate_enabled, estimate_config")
    .eq("estimate_slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.estimate_enabled || !data.estimate_config?.services) return null;
  return data;
}

function toE164(raw: unknown): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return "";
}

async function sendRequestAlert(to: string, message: string) {
  if (!OPENPHONE_API_KEY || !OPENPHONE_FROM_NUMBER || !to) return;
  try {
    const res = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: OPENPHONE_API_KEY },
      body: JSON.stringify({
        content: message,
        from: OPENPHONE_FROM_NUMBER,
        to: [to],
      }),
    });
    if (!res.ok) console.error("Instant Quote alert text failed", res.status, await res.text());
  } catch (err) {
    console.error("Instant Quote alert text threw", err);
  }
}

async function sendCustomerConfirmation(to: string, firstName: string, businessName: string, range: string, replyWindow: string) {
  if (!OPENPHONE_API_KEY || !OPENPHONE_FROM_NUMBER || !to) return;
  try {
    const res = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: OPENPHONE_API_KEY },
      body: JSON.stringify({
        content: `Hi ${firstName}, this is ${businessName}. We got your quote request${range ? ` (${range})` : ""}. We'll text you ${replyWindow}. Reply STOP to opt out.`,
        from: OPENPHONE_FROM_NUMBER,
        to: [to],
      }),
    });
    if (!res.ok) console.error("Instant Quote customer text failed", res.status, await res.text());
  } catch (err) {
    console.error("Instant Quote customer text threw", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, authorization, apikey",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const slug = clean(url.searchParams.get("slug"), 60);
      if (!slug) return json({ error: "Missing slug" }, 400);
      const hit = url.searchParams.get("logo") ? null : cfgCache.get(slug);
      if (hit && Date.now() - hit.t < 30_000) {
        return new Response(hit.body, {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=30" },
        });
      }
      const business = await loadBusiness(slug);
      if (!business) return json({ error: "Not found" }, 404);
      const logoData = String(business.estimate_config?.brand?.logo || "");
      if (url.searchParams.get("logo")) {
        const m = logoData.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
        if (!m) return json({ error: "Not found" }, 404);
        const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        return new Response(bin, {
          headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" },
        });
      }
      // alerts holds the owner's private phone number - never send it to the public page.
      const { alerts: _alerts, ...publicConfig } = business.estimate_config;
      // Show what each service includes: read it live from the services table, matched by name.
      try {
        const { data: rows } = await supabase.from("services").select("name, includes").eq("business_id", business.id);
        const byName = new Map((rows || []).map((r: any) => [String(r.name || "").trim().toLowerCase(), r.includes]));
        if (Array.isArray(publicConfig.services)) {
          publicConfig.services = publicConfig.services.map((sv: any) => {
            const inc = byName.get(String(sv.name || "").trim().toLowerCase());
            return Array.isArray(inc) && inc.length ? { ...sv, includes: inc } : sv;
          });
        }
      } catch (_e) { /* descriptions are optional */ }
      if (logoData.startsWith("data:") && publicConfig.brand) {
        publicConfig.brand = {
          ...publicConfig.brand,
          logo: `${Deno.env.get("SUPABASE_URL")}/functions/v1/estimate-request?slug=${encodeURIComponent(slug)}&logo=1&v=${hashStr(logoData)}`,
        };
      }
      const out = JSON.stringify({ config: publicConfig });
      cfgCache.set(slug, { t: Date.now(), body: out });
      return new Response(out, {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=30" },
      });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Bad request" }, 400);
    }

    const slug = clean(body?.slug, 60);
    const business = slug ? await loadBusiness(slug) : null;
    if (!business) return json({ error: "Not found" }, 404);
    const cfg = business.estimate_config;

    const name = clean(body?.contact?.name, 120);
    const phone = clean(body?.contact?.phone, 40);
    const email = clean(body?.contact?.email, 160);
    const address = clean(body?.contact?.address, 240);
    const notes = clean(body?.contact?.notes, 1000);
    // "Something else": another vehicle or a custom question, sent with no price.
    const openRequest = clean(body?.request, 1000);

    if (name.length < 2) return json({ error: "Please add your name." }, 422);
    if (!phone && !email) return json({ error: "Please add a phone number or an email." }, 422);

    // Crude flood guard: a public form needs one, and this keeps a bot from filling a
    // business's customer list. Real customers never get near it.
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recent } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("source", "estimate_request")
      .gte("created_at", minuteAgo);
    if ((recent ?? 0) >= MAX_PER_MINUTE) return json({ error: "Too many requests right now. Please call us instead." }, 429);

    const services: any[] = Array.isArray(cfg.services) ? cfg.services : [];
    const addons: any[] = Array.isArray(cfg.addons) ? cfg.addons : [];
    const conditions: any[] = Array.isArray(cfg.conditions) ? cfg.conditions : [];
    const frequencies: any[] = Array.isArray(cfg.frequencies) ? cfg.frequencies : [];
    const sizes: any[] = Array.isArray(cfg.sizes) ? cfg.sizes : [];
    const types: any[] = Array.isArray(cfg.types) ? cfg.types.filter((t: any) => t && t.id && t.label) : [];
    const fields: any[] = Array.isArray(cfg.fields) ? cfg.fields : [];

    const itemsIn = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];
    let totalLow = 0;
    let totalHigh = 0;
    let anyOpen = false;
    const lines: any[] = [];
    const itemsOut: any[] = [];

    for (const raw of itemsIn) {
      const typeHit = types.find((t) => t.id === raw?.size);
      const typeId: string = typeHit ? typeHit.id : "";
      const sizeId = typeHit ? typeHit.id : (sizes.find((s) => s.id === raw?.size)?.id ?? sizes[0]?.id ?? "car");
      const cond = conditions.find((c) => c.id === raw?.condition) ?? conditions[1] ?? conditions[0];
      const freq = frequencies.find((f) => f.id === raw?.frequency) ?? frequencies[1] ?? frequencies[0];

      const picked = (Array.isArray(raw?.services) ? raw.services : []).slice(0, MAX_PICKS)
        .map((n: string) => services.find((s) => s.name === n && (s.type || "") === typeId)).filter(Boolean);
      const pickedAddons = typeId ? [] : (Array.isArray(raw?.addons) ? raw.addons : []).slice(0, MAX_PICKS)
        .map((n: string) => addons.find((a) => a.name === n)).filter(Boolean);
      if (!picked.length && !pickedAddons.length) continue;

      const vals: Record<string, string> = {};
      for (const f of fields) {
        const v = clean(raw?.vals?.[f.k], 120);
        if (v) vals[f.label] = v;
      }
      const baseLabel = Object.values(vals).join(" ") || "Job";
      const label = typeHit ? (baseLabel === "Job" ? typeHit.label : `${typeHit.label} - ${baseLabel}`) : baseLabel;

      let iLow = 0;
      let iHigh = 0;
      for (const s of picked) {
        const p = priceFor(s, sizeId, cond, freq);
        iLow += p.low;
        iHigh += p.high;
        anyOpen = anyOpen || p.open;
        lines.push(`${label}: ${s.name} ${p.open ? `from ${money(p.low)}` : `${money(p.low)}-${money(p.high)}`}`);
      }
      for (const a of pickedAddons) {
        const price = Number(a.price) || 0;
        iLow += price;
        iHigh += price;
        lines.push(`${label}: ${a.name} +${money(price)}`);
      }
      totalLow += iLow;
      totalHigh += iHigh;
      itemsOut.push({
        label,
        details: vals,
        size: typeHit ? typeHit.label : (sizes.find((s) => s.id === sizeId)?.label ?? sizeId),
        condition: typeId ? null : (cond?.label ?? null),
        timing: typeId ? null : (freq?.label ?? null),
        services: picked.map((s: any) => s.name),
        addons: pickedAddons.map((a: any) => a.name),
        low: iLow,
        high: iHigh,
      });
    }

    const openOnly = !itemsOut.length;
    if (openOnly && !openRequest) return json({ error: "Please choose a package or tell us what you need." }, 422);

    const range = openOnly ? "" : rangeText(totalLow, totalHigh, anyOpen);

    const leadContext = openOnly
      ? {
        kind: "open_request",
        submitted_at: new Date().toISOString(),
        items: [],
        answers: {
          open_request: openRequest,
          ...(address ? { address } : {}),
          ...(notes ? { notes } : {}),
        },
      }
      : {
        kind: "instant_quote",
        submitted_at: new Date().toISOString(),
        estimate_low: totalLow,
        estimate_high: totalHigh,
        open_ended: anyOpen,
        items: itemsOut,
        answers: {
          estimate_shown: range,
          requested_work: lines.join(" | "),
          ...(openRequest ? { open_request: openRequest } : {}),
          ...(address ? { address } : {}),
          ...(notes ? { notes } : {}),
        },
      };

    // Same person double-tapping Send, or tweaking and resending, is one lead.
    const since = new Date(Date.now() - DEDUPE_WINDOW_MINUTES * 60_000).toISOString();
    let customerId: string | null = null;
    const probe = supabase
      .from("customers").select("id")
      .eq("business_id", business.id).eq("source", "estimate_request").gte("created_at", since).limit(1);
    const { data: existing } = phone ? await probe.eq("phone", phone) : await probe.eq("email", email);
    if (existing?.length) customerId = existing[0].id;

    if (customerId) {
      await supabase.from("customers")
        .update({ name, email: email || null, phone: phone || null, address: address || null, lead_context: leadContext })
        .eq("id", customerId);
    } else {
      const { data: inserted, error: custErr } = await supabase
        .from("customers")
        .insert({
          business_id: business.id,
          name,
          email: email || null,
          phone: phone || null,
          address: address || null,
          source: "estimate_request",
          source_ref: `${slug}:${crypto.randomUUID()}`,
          lead_context: leadContext,
        })
        .select("id")
        .single();
      if (custErr) {
        console.error("estimate-request: customer insert failed", custErr.message);
        return json({ error: "Could not save your request. Please call us instead." }, 500);
      }
      customerId = inserted.id;

      const { error: fuErr } = await supabase.from("follow_ups").insert({
        business_id: business.id,
        note: (openOnly
          ? `New open request (needs a price): ${name} - ${openRequest}`
          : `New Instant Quote request: ${name} - ${range}. ${itemsOut.map((i) => `${i.label}: ${i.services.concat(i.addons).join(", ")}`).join("; ")}${openRequest ? ` | Also asked: ${openRequest}` : ""}`).slice(0, 500),
        due_date: new Date().toISOString().slice(0, 10),
        method: phone ? "text" : "email",
        customer_ids: [customerId],
      });
      if (fuErr) console.error("estimate-request: follow-up insert failed", fuErr.message);

      // Phone notification (banner + sound + icon badge) for devices that turned it on in Atlas.
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({
            business_id: business.id,
            title: openOnly ? `Open request: ${name.slice(0, 40)}` : `New quote request: ${name.slice(0, 40)}`,
            body: openOnly
              ? `${openRequest.slice(0, 160)}${phone ? ` - ${phone}` : ""}`
              : `${itemsOut.map((i) => `${i.label !== "Job" ? `${i.label}: ` : ""}${i.services.concat(i.addons).join(" + ")}`).join("; ")} - ${ownerRange(totalLow, totalHigh)}${phone ? ` - ${phone}` : ""}${openRequest ? ` - Also: ${openRequest.slice(0, 100)}` : ""}`,
            url: "/",
            tag: "estimate-request",
          }),
        });
      } catch (err) {
        console.error("estimate-request: push notify failed", err);
      }

      // Only the Atlas number's own business may text; every other shop uses phone notifications.
      const alertTo = business.id === ALERT_BUSINESS_ID
        ? (cfg.alerts?.sms ? toE164(cfg.alerts.phone) : OWNER_ALERT_PHONE)
        : "";
      if (alertTo) {
        const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
        const { count: lastHour } = await supabase
          .from("customers").select("id", { count: "exact", head: true })
          .eq("business_id", business.id).eq("source", "estimate_request").gte("created_at", hourAgo);
        if ((lastHour ?? 0) <= MAX_ALERTS_PER_HOUR) {
          const jobs = itemsOut.map((i) => {
            const det = Object.values(i.details || {}).join(" ");
            const head = [det || i.size, i.condition && `Condition: ${i.condition}`, i.timing && `Timing: ${i.timing}`]
              .filter(Boolean).join(" | ");
            const picks = i.services.map((s: string) => `  - ${s}`).concat(i.addons.map((a: string) => `  - Add-on: ${a}`)).join("\n");
            return itemsOut.length > 1 ? `${head}\n${picks}\n  Est: ${ownerRange(i.low, i.high)}` : `${head}\n${picks}`;
          }).join("\n");
          const msg = [
            openOnly ? `NEW OPEN REQUEST (no price yet) - ${name.slice(0, 60)}` : `NEW QUOTE REQUEST - ${name.slice(0, 60)}`,
            phone && `Phone: ${phone}`,
            email && `Email: ${email}`,
            openOnly ? `Asked:\n${openRequest.slice(0, 500)}` : `Wants:\n${jobs}`,
            !openOnly && openRequest && `Also asked: ${openRequest.slice(0, 300)}`,
            !openOnly && `Estimate: ${ownerRange(totalLow, totalHigh)}`,
            address && `Address: ${address}`,
            notes && `Notes: ${notes.slice(0, 300)}`,
            "Reply fast - they're waiting.",
          ].filter(Boolean).join("\n").slice(0, 900);
          await sendRequestAlert(alertTo, msg);
        }
      }

      // Customer confirmation text: only with their ticked consent, only when the owner turned
      // it on, and only for the Atlas number's own business (other shops need their own texting).
      const customerTo = toE164(phone);
      if (body?.sms_consent === true && customerTo && cfg.autoReply?.sms && business.id === ALERT_BUSINESS_ID) {
        await supabase.from("customers").update({ sms_consent_at: new Date().toISOString() }).eq("id", customerId);
        const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
        const { count: sentHour } = await supabase
          .from("customers").select("id", { count: "exact", head: true })
          .eq("business_id", business.id).not("sms_consent_at", "is", null).gte("sms_consent_at", hourAgo);
        if ((sentHour ?? 0) <= MAX_ALERTS_PER_HOUR) {
          const first = name.split(/\s+/)[0].slice(0, 30);
          const when = clean(cfg.brand?.replyWindow, 60) || "within 1 business hour";
          await sendCustomerConfirmation(customerTo, first, clean(business.name, 60), range, when.startsWith("within") || when.startsWith("in ") ? when : `within ${when}`);
        }
      }
    }

    return json({ ok: true, open_request: openOnly, estimate_low: totalLow, estimate_high: totalHigh, open_ended: anyOpen });
  } catch (err) {
    console.error("estimate-request failed", err);
    return json({ error: "Something went wrong. Please call us instead." }, 500);
  }
});
