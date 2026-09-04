import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Receives Meta (Facebook) Lead Ads webhook pings and turns each new lead
// into an Atlas customer automatically. Two Meta setup steps point here:
//  1. Webhook verification (GET) - Meta calls this once when you save the
//     webhook subscription in the Meta App dashboard, to prove you control
//     this URL. It must echo back `hub.challenge` if `hub.verify_token`
//     matches the FB_VERIFY_TOKEN secret below.
//  2. Lead events (POST) - Meta calls this every time someone submits a
//     Lead Ads form on a subscribed Page. The payload only carries a
//     `leadgen_id`, not the actual answers, so this fetches the real
//     name/email/phone from the Graph API using a Page Access Token before
//     writing the customer row.
//
// Required secrets (Project Settings -> Edge Functions -> Secrets, or
// `supabase secrets set`) - none of this works until these are set:
//   FB_VERIFY_TOKEN       - a string you invent; enter the same value in
//                           the Meta App's webhook subscription form.
//   FB_APP_SECRET         - from the Meta App's Settings -> Basic. Used to
//                           verify the X-Hub-Signature-256 header so this
//                           function only accepts requests that really came
//                           from Meta.
//   FB_PAGE_ACCESS_TOKEN  - a Page Access Token for the Facebook Page the
//                           leads come from, with the leads_retrieval
//                           permission.
//   ATLAS_BUSINESS_ID     - which Atlas business new leads get filed under
//                           (Detail Hero's id: ac96b595-8468-42a6-8336-0fb0e7c07d2d).
//                           Hardcoded per-secret rather than looked up,
//                           since there's no Page-id-to-business mapping
//                           table yet - fine for a single-business app.
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically by
// the Edge Functions runtime and don't need to be set.

const VERIFY_TOKEN = Deno.env.get("FB_VERIFY_TOKEN") || "";
const APP_SECRET = Deno.env.get("FB_APP_SECRET") || "";
const PAGE_ACCESS_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN") || "";
const BUSINESS_ID = Deno.env.get("ATLAS_BUSINESS_ID") || "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function isValidSignature(req: Request, rawBody: string): Promise<boolean> {
  if (!APP_SECRET) return false;
  const header = req.headers.get("x-hub-signature-256") || "";
  const expectedPrefix = "sha256=";
  if (!header.startsWith(expectedPrefix)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = expectedPrefix + toHex(mac);
  // Lengths are fixed/equal here (both hex SHA-256), so a simple compare
  // doesn't leak useful timing information the way a raw string diff over
  // variable-length secret data would.
  return expected === header;
}

async function processLead(leadgenId: string) {
  if (!BUSINESS_ID || !PAGE_ACCESS_TOKEN) {
    console.error("Missing ATLAS_BUSINESS_ID or FB_PAGE_ACCESS_TOKEN secret - cannot file lead", leadgenId);
    return;
  }

  // Meta retries webhook deliveries, so guard against filing the same lead
  // twice using the leadgen_id stashed in customers.source_ref.
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", BUSINESS_ID)
    .eq("source_ref", leadgenId)
    .maybeSingle();
  if (existing) return;

  const res = await fetch(`https://graph.facebook.com/v21.0/${leadgenId}?access_token=${PAGE_ACCESS_TOKEN}`);
  if (!res.ok) {
    console.error("Graph API lead fetch failed", leadgenId, res.status, await res.text());
    return;
  }
  const lead = await res.json();
  const fields: Record<string, string> = {};
  for (const f of lead.field_data || []) {
    const value = Array.isArray(f.values) ? f.values[0] : f.values;
    if (value != null) fields[f.name] = String(value);
  }

  const name = fields.full_name || [fields.first_name, fields.last_name].filter(Boolean).join(" ") || "Facebook lead";
  const email = fields.email || null;
  const phone = fields.phone_number || null;

  const { error } = await supabase.from("customers").insert({
    business_id: BUSINESS_ID,
    name,
    email,
    phone,
    source: "facebook_lead_ads",
    source_ref: leadgenId,
  });
  if (error) console.error("Failed to insert lead customer", leadgenId, error.message);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") || "";
    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const rawBody = await req.text();
    if (!(await isValidSignature(req, rawBody))) {
      return new Response("Invalid signature", { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const leadIds: string[] = [];
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === "leadgen" && change.value?.leadgen_id) {
          leadIds.push(String(change.value.leadgen_id));
        }
      }
    }
    await Promise.all(leadIds.map(processLead));

    // Meta expects a fast 200 regardless of downstream outcome - errors are
    // logged (see processLead) rather than surfaced here, since a non-200
    // makes Meta retry the whole delivery repeatedly.
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  return new Response("Not found", { status: 404 });
});
