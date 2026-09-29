import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Owns the customer-facing quote's data and the Approve write, keyed by
// quotes.share_token (an unguessable random token, not the row's real id,
// so a customer's link can only ever read/affect their own quote).
//
// The actual page is rendered by a Vercel serverless function
// (api/quote-portal.js in the main repo), not here - Supabase's Edge
// Function gateway forces every response's Content-Type to text/plain
// with a sandboxed CSP, regardless of what a function sets, so nothing
// served from here can ever render as a webpage in a real browser. That
// Vercel function calls this one server-to-server with ?format=json for
// the data, and proxies the customer's Approve POST back to it.
//
// Optional secrets for the "customer approved" alert text. Named QUO_* to
// match the OpenPhone/Quo secrets already configured for this project - the
// API itself is still hosted at api.openphone.com regardless of the
// product's current name.
//   QUO_API_KEY / QUO_FROM_NUMBER / OWNER_ALERT_PHONE

const OPENPHONE_API_KEY = Deno.env.get("QUO_API_KEY") || "";
const OPENPHONE_FROM_NUMBER = Deno.env.get("QUO_FROM_NUMBER") || "";
const OWNER_ALERT_PHONE = Deno.env.get("OWNER_ALERT_PHONE") || "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function money(n: number): string {
  return `$${(Number(n) || 0).toLocaleString()}`;
}

async function sendApprovalAlert(businessId: string, customerName: string, chosenLabel: string, total: number) {
  if (!OPENPHONE_API_KEY || !OPENPHONE_FROM_NUMBER || !OWNER_ALERT_PHONE) return;
  try {
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date());
    const res = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: OPENPHONE_API_KEY },
      body: JSON.stringify({
        content: `${customerName} approved their quote at ${time}${chosenLabel ? ` (${chosenLabel})` : ""} — ${money(total)}. Get it booked!`,
        from: OPENPHONE_FROM_NUMBER,
        to: [OWNER_ALERT_PHONE],
      }),
    });
    if (!res.ok) console.error("Approval alert text failed", res.status, await res.text());
  } catch (err) {
    console.error("Approval alert text threw", err);
  }
}

function svcPrice(service: any, vehicle: any): number {
  if (!service) return 0;
  const isSuv = vehicle?.size_class === "suv" || vehicle?.size_class === "truck" || vehicle?.size_class === "van";
  return Number(isSuv ? service.price_suv_low : service.price_car_low) || 0;
}

// A service's price as actually charged on this quote - a per-quote price
// override (set on Review in Atlas) if one exists, otherwise the catalog
// price. The approved total below must read this too, or a customer could
// approve at a discounted price shown on the page while Atlas records the
// full catalog price.
function effectivePrice(serviceId: string, service: any, vehicle: any, overrides: Record<string, any>): number {
  const o = overrides?.[serviceId];
  if (o && o.price != null && o.price !== "") return Number(o.price) || 0;
  return svcPrice(service, vehicle);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return new Response("Missing token", { status: 400 });

  const { data: quote, error } = await supabase
    .from("quotes")
    .select("*, customers(name, email, phone), businesses(name, logo_url, tagline, phone, email, address, website, social_links)")
    .eq("share_token", token)
    .maybeSingle();

  if (error || !quote) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const vehicleIds: string[] = quote.line_items?.vehicleIds || [];
  const { data: vehicles } = vehicleIds.length
    ? await supabase.from("vehicles").select("id, label, size_class").in("id", vehicleIds)
    : { data: [] };
  const vehicle = vehicles?.[0] || null;

  const serviceIds = new Set<string>();
  if (quote.proposal_mode === "tiered") {
    for (const t of quote.tiers || []) for (const id of t.packageIds || []) serviceIds.add(id);
  } else {
    for (const v of quote.line_items?.vehicleIds || []) for (const id of quote.line_items?.byVehicle?.[v] || []) serviceIds.add(id);
  }
  const addonIds = new Set<string>();
  if (quote.proposal_mode === "tiered") {
    for (const t of quote.tiers || []) for (const id of t.addonIds || []) addonIds.add(id);
  } else {
    for (const id of quote.line_items?.addonIds || []) addonIds.add(id);
  }

  const [{ data: services }, { data: addonsAll }, { data: addOnCategoryServices }] = await Promise.all([
    serviceIds.size ? supabase.from("services").select("id, name, description, includes, price_car_low, price_suv_low").in("id", [...serviceIds]) : Promise.resolve({ data: [] }),
    addonIds.size ? supabase.from("addons").select("id, name, price").in("id", [...addonIds]) : Promise.resolve({ data: [] }),
    supabase.from("services").select("id, name, description, price_car_low, price_suv_low").eq("business_id", quote.business_id).eq("category", "Add-Ons"),
  ]);

  // Optional extras offered on the page itself - anything in the business's
  // Add-Ons catalog category that isn't already part of this quote.
  const extraAddonServices = (addOnCategoryServices || []).filter((s: any) => !serviceIds.has(s.id));

  if (req.method === "GET" && url.searchParams.get("format") === "json") {
    return new Response(JSON.stringify({
      quote,
      business: quote.businesses || {},
      customer: quote.customers || { name: "Customer" },
      vehicle,
      services: services || [],
      addonsAll: addonsAll || [],
      extraAddonServices,
      alreadyApproved: ["approved", "booked"].includes(quote.status),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (req.method === "GET") {
    // A bare GET here (no format=json) only happens if someone hits this
    // raw Supabase URL directly instead of the real quote link from Atlas -
    // nothing served from here can render as a webpage (see file header).
    return new Response(JSON.stringify({ error: "Use the link from Atlas, not this raw API URL." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST") {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Bad request" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    // chosenTierIds (plural) is the current shape - any number of tiers can
    // be chosen at once. chosenTierId (singular) is accepted too, for any
    // link still running the previous single-select page.
    const chosenTierIds: string[] = Array.isArray(body.chosenTierIds)
      ? body.chosenTierIds
      : body.chosenTierId ? [body.chosenTierId] : [];
    const chosenAddonIds = Array.isArray(body.chosenAddonIds) ? body.chosenAddonIds : [];
    // Re-validated against this business's actual Add-Ons catalog (not just
    // trusted from the client) - a submitted id that isn't really one of
    // this business's Add-Ons services is silently dropped.
    const validExtraIds = new Set(extraAddonServices.map((s: any) => s.id));
    const extraServiceIds = (Array.isArray(body.extraServiceIds) ? body.extraServiceIds : []).filter((id: string) => validExtraIds.has(id));

    let total = 0;
    const servicesById = Object.fromEntries((services || []).map((s: any) => [s.id, s]));
    const addonsById = Object.fromEntries((addonsAll || []).map((a: any) => [a.id, a]));
    const extrasById = Object.fromEntries(extraAddonServices.map((s: any) => [s.id, s]));
    const overrides = quote.service_overrides || {};
    let chosenLabel = "";
    if (quote.proposal_mode === "tiered") {
      const chosenTiers = (quote.tiers || []).filter((t: any) => chosenTierIds.includes(t.id));
      if (chosenTiers.length) {
        chosenLabel = chosenTiers.map((t: any) => t.name).join(" + ");
        for (const tier of chosenTiers) {
          total += (tier.packageIds || []).reduce((s: number, id: string) => s + effectivePrice(id, servicesById[id], vehicle, overrides), 0);
          total += (tier.addonIds || []).filter((id: string) => chosenAddonIds.includes(id)).reduce((s: number, id: string) => s + (Number(addonsById[id]?.price) || 0), 0);
        }
      }
    } else {
      for (const v of quote.line_items?.vehicleIds || []) {
        for (const id of quote.line_items?.byVehicle?.[v] || []) total += effectivePrice(id, servicesById[id], vehicle, overrides);
      }
      total += chosenAddonIds.reduce((s: number, id: string) => s + (Number(addonsById[id]?.price) || 0), 0);
    }
    total += extraServiceIds.reduce((s: number, id: string) => s + svcPrice(extrasById[id], vehicle), 0);
    total *= 1 + (Number(quote.tax_rate) || 0) / 100;

    const extraNames = extraServiceIds.map((id: string) => extrasById[id]?.name).filter(Boolean);
    if (extraNames.length) chosenLabel = [chosenLabel, `+ ${extraNames.join(", ")}`].filter(Boolean).join(" ");

    const { error: updateError } = await supabase
      .from("quotes")
      .update({
        status: "approved",
        chosen_tier_id: chosenTierIds[0] || null,
        chosen_tier_ids: chosenTierIds,
        chosen_addon_ids: chosenAddonIds,
        extra_service_ids: extraServiceIds,
        approved_at: new Date().toISOString(),
      })
      .eq("id", quote.id);
    if (updateError) {
      console.error("Failed to record approval", quote.id, updateError.message);
      return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    // Same "real action closes an open follow-up" behavior as everywhere
    // else in Atlas - approving a quote is exactly that kind of action.
    if (quote.customer_id) {
      await supabase.from("follow_ups").update({ status: "done", completed_at: new Date().toISOString() }).eq("status", "pending").contains("customer_ids", [quote.customer_id]);
    }

    await sendApprovalAlert(quote.business_id, quote.customers?.name || "A customer", chosenLabel, total);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  return new Response("Not found", { status: 404 });
});
