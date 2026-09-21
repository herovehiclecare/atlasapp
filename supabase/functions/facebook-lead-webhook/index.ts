import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================================
// FACEBOOK LEAD + MESSENGER WEBHOOK
//
// Handles both:
//   * Lead Ads form submitted   -> Atlas customer + same-day follow-up + Quo text
//   * Someone messages the Page -> Atlas customer (first time only) + follow-up
//                                  + Quo text alert to the owner
//
// v11: added Messenger handling, replacing the earlier plan to poll for it
// on a timer (facebook-messenger-poll, now decommissioned - real-time beats
// a delayed poll once both need the same pages_messaging permission anyway).
//
// Secrets (Project Settings -> Edge Functions -> Secrets):
//   FB_VERIFY_TOKEN       - a string you invent; matches the Meta webhook's
//                           verify token.
//   FB_APP_SECRET         - from the Meta App's Settings -> Basic. Verifies
//                           the X-Hub-Signature-256 header.
//   FB_PAGE_ACCESS_TOKEN  - a Page Access Token with leads_retrieval AND
//                           pages_messaging (the Messenger half silently
//                           fails Graph API calls without the latter).
//   ATLAS_BUSINESS_ID     - which Atlas business new leads/messages file
//                           under (Detail Hero's id:
//                           ac96b595-8468-42a6-8336-0fb0e7c07d2d).
//   OPENPHONE_API_KEY / OPENPHONE_FROM_NUMBER / OWNER_ALERT_PHONE - optional,
//                           for the same-second SMS alert via Quo/OpenPhone.
//                           Leaving any unset just skips the text.
//   MESSENGER_ALERT_ALL   - optional, "true" texts the owner on every inbound
//                           Messenger message, not just from new people.
//
// Meta-side setup needed for the Messenger half (not done by this code):
//   1. In the Meta App dashboard's Webhooks -> Page screen, subscribe to the
//      "messages" field (same screen used for "leadgen" earlier), pointing
//      at this same function URL.
//   2. The Page Access Token must include pages_messaging.
//   3. Meta may restrict real (non-admin) senders' messages from being
//      delivered until the app passes App Review for pages_messaging at
//      Advanced Access - unlike leads_retrieval, this is a real platform
//      gate that can't be clicked through, and is outside anyone's control
//      but Meta's review team.
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically by
// the Edge Functions runtime and don't need to be set.

const VERIFY_TOKEN = Deno.env.get("FB_VERIFY_TOKEN") || "";
const APP_SECRET = Deno.env.get("FB_APP_SECRET") || "";
const PAGE_ACCESS_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN") || "";
const BUSINESS_ID = Deno.env.get("ATLAS_BUSINESS_ID") || "";
const OPENPHONE_API_KEY = Deno.env.get("OPENPHONE_API_KEY") || "";
const OPENPHONE_FROM_NUMBER = Deno.env.get("OPENPHONE_FROM_NUMBER") || "";
const OWNER_ALERT_PHONE = Deno.env.get("OWNER_ALERT_PHONE") || "";
const MESSENGER_ALERT_ALL = (Deno.env.get("MESSENGER_ALERT_ALL") || "").toLowerCase() === "true";

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

function nowLocalTime(): string {
  // Hardcoded to Detail Hero's own timezone (Orlando, FL) rather than a
  // stored setting - single-business simplification, same as ATLAS_BUSINESS_ID.
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date());
}

// One place that sends the owner a text through Quo. Never throws - errors
// are logged, not allowed to fail the lead/message processing around it.
async function sendOwnerText(content: string) {
  if (!OPENPHONE_API_KEY || !OPENPHONE_FROM_NUMBER || !OWNER_ALERT_PHONE) return;
  try {
    const res = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: OPENPHONE_API_KEY },
      body: JSON.stringify({ content, from: OPENPHONE_FROM_NUMBER, to: [OWNER_ALERT_PHONE] }),
    });
    if (!res.ok) console.error("Owner alert text failed", res.status, await res.text());
  } catch (err) {
    console.error("Owner alert text threw", err);
  }
}

async function sendLeadAlertText(name: string, phone: string | null) {
  const who = name && name !== "Facebook lead" ? name : "Someone";
  const contact = phone ? ` (${phone})` : "";
  await sendOwnerText(`New Facebook lead at ${nowLocalTime()}: ${who}${contact}. Reach out ASAP! Check Atlas for details.`);
}

// ---------------------------------------------------------------------------
// Lead Ads forms
// ---------------------------------------------------------------------------
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

  // Requesting these fields explicitly is what actually returns the human-
  // readable ad/campaign names - they aren't included by default.
  const leadFields = "field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,created_time";
  const res = await fetch(`https://graph.facebook.com/v21.0/${leadgenId}?fields=${leadFields}&access_token=${PAGE_ACCESS_TOKEN}`);
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

  // Everything on the form beyond name/email/phone (interest, vehicle info,
  // preferred contact method, or whatever custom questions a given form
  // asks) has no fixed field names - Meta returns whatever the form's own
  // questions are keyed as. Rather than hardcode question names this app
  // doesn't control, every other answer is kept as-is so it can still be
  // shown on the lead, whatever the form happens to ask.
  const KNOWN_FIELDS = new Set(["full_name", "first_name", "last_name", "email", "phone_number"]);
  const otherAnswers: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!KNOWN_FIELDS.has(key)) otherAnswers[key] = value;
  }

  // Kept separate from the flat name/email/phone columns since this is
  // attribution metadata, not contact info - shown on the customer's
  // profile as "came from" context, not something anyone edits.
  const leadContext = {
    ad_id: lead.ad_id || null,
    ad_name: lead.ad_name || null,
    adset_id: lead.adset_id || null,
    adset_name: lead.adset_name || null,
    campaign_id: lead.campaign_id || null,
    campaign_name: lead.campaign_name || null,
    form_id: lead.form_id || null,
    platform: lead.platform || null,
    submitted_at: lead.created_time ? new Date(lead.created_time * 1000).toISOString() : null,
    answers: otherAnswers,
  };

  const { data: newCustomer, error } = await supabase
    .from("customers")
    .insert({
      business_id: BUSINESS_ID,
      name,
      email,
      phone,
      source: "facebook_lead_ads",
      source_ref: leadgenId,
      lead_context: leadContext,
    })
    .select("id")
    .single();
  if (error) {
    console.error("Failed to insert lead customer", leadgenId, error.message);
    return;
  }

  // A fresh lead is easy to forget about once it's just another row in
  // Customers, so this drops a same-day Follow-up automatically. method:
  // "text" means opening it in Atlas surfaces the existing AI-suggested-text
  // card (drafted, not auto-sent) rather than a bare reminder.
  const { error: followUpError } = await supabase.from("follow_ups").insert({
    business_id: BUSINESS_ID,
    note: `New Facebook lead${name && name !== "Facebook lead" ? `: ${name}` : ""} — reach out and get them scheduled.`,
    due_date: new Date().toISOString().slice(0, 10),
    method: "text",
    customer_ids: [newCustomer.id],
  });
  if (followUpError) console.error("Failed to create lead follow-up", leadgenId, followUpError.message);

  await sendLeadAlertText(name, phone);
}

// ---------------------------------------------------------------------------
// Messenger
// ---------------------------------------------------------------------------

// Meta only sends the sender's page-scoped id (PSID) - ask the Graph API for
// a display name; if that's not permitted (or returns nothing), fall back to
// a generic label so the customer/follow-up still get created either way.
async function fetchMessengerName(psid: string): Promise<string> {
  if (!PAGE_ACCESS_TOKEN) return "Messenger contact";
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${psid}?fields=name&access_token=${PAGE_ACCESS_TOKEN}`);
    if (!res.ok) {
      console.error("Messenger profile fetch failed", res.status, await res.text());
      return "Messenger contact";
    }
    const body = await res.json();
    return (body.name && String(body.name).trim()) || "Messenger contact";
  } catch (err) {
    console.error("Messenger profile fetch threw", err);
    return "Messenger contact";
  }
}

async function processMessengerEvent(event: any, pageId: string) {
  if (!BUSINESS_ID) {
    console.error("Missing ATLAS_BUSINESS_ID secret - cannot file Messenger contact");
    return;
  }

  const psid: string | undefined = event?.sender?.id;
  // Ignore anything that isn't a real inbound message: the Page's own
  // replies (echoes), delivery/read receipts, and messages from the Page.
  if (!psid || psid === pageId) return;
  if (event.message?.is_echo) return;
  if (!event.message && !event.postback) return;

  const rawText: string =
    event.message?.text ||
    (event.message?.attachments?.length ? "[sent an attachment]" : "") ||
    event.postback?.title ||
    "";
  const snippet = rawText.length > 140 ? rawText.slice(0, 137) + "..." : rawText;
  const sourceRef = `msgr:${psid}`;

  // 1) Already known by Messenger id -> not a new lead.
  const { data: known } = await supabase
    .from("customers")
    .select("id, name")
    .eq("business_id", BUSINESS_ID)
    .eq("source_ref", sourceRef)
    .maybeSingle();

  if (known) {
    if (MESSENGER_ALERT_ALL) {
      await sendOwnerText(`Messenger message at ${nowLocalTime()} from ${known.name}: "${snippet}". Reply in Meta Business Suite.`);
    }
    return;
  }

  const name = await fetchMessengerName(psid);

  // 2) Someone already imported by hand/bulk (source_ref empty) with the
  //    same name: adopt that row by stamping the Messenger id on it,
  //    instead of creating a duplicate customer. Only when exactly one
  //    match exists, to avoid guessing wrong between two same-named people.
  if (name !== "Messenger contact") {
    const { data: sameName } = await supabase
      .from("customers")
      .select("id, name")
      .eq("business_id", BUSINESS_ID)
      .eq("source", "facebook_messenger")
      .is("source_ref", null)
      .eq("name", name);
    if (sameName && sameName.length === 1) {
      await supabase.from("customers").update({ source_ref: sourceRef }).eq("id", sameName[0].id);
      if (MESSENGER_ALERT_ALL) {
        await sendOwnerText(`Messenger message at ${nowLocalTime()} from ${name}: "${snippet}". Reply in Meta Business Suite.`);
      }
      return;
    }
  }

  // 3) Genuinely new person -> customer + follow-up + alert.
  const { data: newCustomer, error } = await supabase
    .from("customers")
    .insert({
      business_id: BUSINESS_ID,
      name,
      source: "facebook_messenger",
      source_ref: sourceRef,
      notes: `Messaged the Page on Facebook Messenger. No phone/email on file yet.${snippet ? ` First message: "${snippet}"` : ""}`,
    })
    .select("id")
    .single();
  if (error) {
    console.error("Failed to insert Messenger customer", psid, error.message);
    return;
  }

  const { error: followUpError } = await supabase.from("follow_ups").insert({
    business_id: BUSINESS_ID,
    note: `New Messenger message from ${name} — reply, then ask for their vehicle, the service they want, and a phone number.`,
    due_date: new Date().toISOString().slice(0, 10),
    method: "text",
    customer_ids: [newCustomer.id],
  });
  if (followUpError) console.error("Failed to create Messenger follow-up", psid, followUpError.message);

  await sendOwnerText(`New Messenger message at ${nowLocalTime()} from ${name}${snippet ? `: "${snippet}"` : ""}. Reply in Meta Business Suite; details in Atlas.`);
}

// ---------------------------------------------------------------------------
// HTTP entry point
// ---------------------------------------------------------------------------
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
    const messengerEvents: { event: any; pageId: string }[] = [];

    for (const entry of payload.entry || []) {
      // Lead Ads
      for (const change of entry.changes || []) {
        if (change.field === "leadgen" && change.value?.leadgen_id) {
          leadIds.push(String(change.value.leadgen_id));
        }
      }
      // Messenger: Page webhooks put messages under entry.messaging
      for (const event of entry.messaging || []) {
        messengerEvents.push({ event, pageId: String(entry.id || "") });
      }
    }

    await Promise.all(leadIds.map(processLead));
    // Sequential on purpose: two quick messages from the same new person
    // must not both pass the "already known?" check and create duplicates.
    for (const { event, pageId } of messengerEvents) {
      try {
        await processMessengerEvent(event, pageId);
      } catch (err) {
        console.error("Messenger event failed", err);
      }
    }

    // Meta expects a fast 200 regardless of downstream outcome - errors are
    // logged above rather than surfaced here, since a non-200 makes Meta
    // retry the whole delivery repeatedly.
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  return new Response("Not found", { status: 404 });
});
