import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================================
// FACEBOOK LEAD + MESSENGER WEBHOOK
//
//   * Lead Ads form submitted   -> Atlas customer + same-day follow-up + Quo text
//   * Someone messages the Page -> Atlas customer (first time only) + follow-up
//                                  + Quo text alert to the owner
//
// Secrets: FB_VERIFY_TOKEN, FB_APP_SECRET, FB_PAGE_ACCESS_TOKEN,
// ATLAS_BUSINESS_ID, QUO_API_KEY, QUO_FROM_NUMBER, OWNER_ALERT_PHONE.
// Optional: MESSENGER_ALERT_ALL="true" -> text the owner on EVERY inbound message
// (default: only when a NEW person messages).
// ============================================================================

const VERIFY_TOKEN = Deno.env.get("FB_VERIFY_TOKEN") || "";
const APP_SECRET = Deno.env.get("FB_APP_SECRET") || "";
const PAGE_ACCESS_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN") || "";
const BUSINESS_ID = Deno.env.get("ATLAS_BUSINESS_ID") || "";
const OPENPHONE_API_KEY = Deno.env.get("QUO_API_KEY") || "";
const OPENPHONE_FROM_NUMBER = Deno.env.get("QUO_FROM_NUMBER") || "";
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
  return expectedPrefix + toHex(mac) === header;
}

function nowLocalTime(): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date());
}

// Meta's leadgen `created_time` field comes back as an ISO 8601 string
// (e.g. "2026-09-29T21:23:00+0000"), not a Unix timestamp - treating it as
// one (the previous `* 1000` conversion) produced an Invalid Date and threw
// on every real lead, crashing the whole webhook with a 500 before the
// customer/follow-up/alert ever ran. This never throws either way, and
// falls back to null (this field is metadata only, not worth losing an
// entire lead over) if the value turns out to be something unparseable.
function safeIsoDate(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(value as any);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// One place that sends the owner a text through Quo. Never throws.
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

// The safety net for the exact class of bug that let Rob Adamek's lead get
// silently dropped: whenever a lead or Messenger message can't be saved for
// ANY reason (a bug like that one, a Graph API hiccup, whatever), this
// records the raw data so nothing is truly lost even if Atlas never turns
// it into a real customer, and - just as important - texts the owner
// immediately so a failure is never just a silent gap discovered by chance
// days or weeks later. Never throws itself, on purpose: a failure in the
// failure-handler must not also go silent.
async function recordAndAlertFailure(source: string, rawPayload: unknown, errorMessage: string) {
  try {
    await supabase.from("failed_webhook_events").insert({
      business_id: BUSINESS_ID || null,
      source,
      raw_payload: rawPayload,
      error_message: errorMessage,
    });
  } catch (err) {
    console.error("Failed to record failed_webhook_event", err);
  }
  await sendOwnerText(`⚠️ Atlas couldn't save a ${source === "facebook_lead_ads" ? "Facebook lead" : "Messenger message"} automatically at ${nowLocalTime()} (${errorMessage}). Check Meta's Lead Center / Messenger and add them by hand - we're looking into the bug.`);
}

// ---------------------------------------------------------------------------
// Lead Ads forms (unchanged from v10)
// ---------------------------------------------------------------------------
async function processLead(leadgenId: string) {
  if (!BUSINESS_ID || !PAGE_ACCESS_TOKEN) {
    console.error("Missing ATLAS_BUSINESS_ID or FB_PAGE_ACCESS_TOKEN secret - cannot file lead", leadgenId);
    return;
  }

  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", BUSINESS_ID)
    .eq("source_ref", leadgenId)
    .maybeSingle();
  if (existing) return;

  const leadFields = "field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,created_time";
  const res = await fetch(`https://graph.facebook.com/v21.0/${leadgenId}?fields=${leadFields}&access_token=${PAGE_ACCESS_TOKEN}`);
  if (!res.ok) {
    const errText = await res.text();
    console.error("Graph API lead fetch failed", leadgenId, res.status, errText);
    await recordAndAlertFailure("facebook_lead_ads", { leadgenId }, `Graph API fetch failed (${res.status}): ${errText.slice(0, 200)}`);
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

  const KNOWN_FIELDS = new Set(["full_name", "first_name", "last_name", "email", "phone_number"]);
  const otherAnswers: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!KNOWN_FIELDS.has(key)) otherAnswers[key] = value;
  }

  const leadContext = {
    ad_id: lead.ad_id || null,
    ad_name: lead.ad_name || null,
    adset_id: lead.adset_id || null,
    adset_name: lead.adset_name || null,
    campaign_id: lead.campaign_id || null,
    campaign_name: lead.campaign_name || null,
    form_id: lead.form_id || null,
    platform: lead.platform || null,
    submitted_at: safeIsoDate(lead.created_time),
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
    await recordAndAlertFailure("facebook_lead_ads", { leadgenId, name, email, phone, leadContext }, `Couldn't save customer: ${error.message}`);
    return;
  }

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
// MESSENGER (new)
// ---------------------------------------------------------------------------

// Meta only sends the sender's page-scoped id (PSID). Ask the Graph API for a
// display name; if that is not permitted, fall back to a generic label so the
// customer/follow-up still get created.
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
  // Ignore anything that is not a real inbound message: the Page's own replies
  // (echoes), delivery/read receipts, and messages sent by the Page itself.
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

  // 2) Someone already imported by hand/bulk (source_ref empty) with the same
  //    name: adopt that row by stamping the Messenger id on it, instead of
  //    creating a duplicate customer. Only do this when there is exactly one match.
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
    await recordAndAlertFailure("facebook_messenger", { psid, name, snippet }, `Couldn't save customer: ${error.message}`);
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
      // Lead Ads (unchanged)
      for (const change of entry.changes || []) {
        if (change.field === "leadgen" && change.value?.leadgen_id) {
          leadIds.push(String(change.value.leadgen_id));
        }
      }
      // Messenger (new): Page webhooks put messages under entry.messaging
      for (const event of entry.messaging || []) {
        messengerEvents.push({ event, pageId: String(entry.id || "") });
      }
    }

    // Each lead's own try/catch, same pattern as the Messenger loop below -
    // Promise.all alone would let one bad lead's uncaught error 500 the
    // whole response (and Meta then retries the entire batch, repeatedly,
    // instead of just the one that actually failed) and block every other
    // lead in the same delivery from ever being saved.
    await Promise.all(leadIds.map(async (id) => {
      try {
        await processLead(id);
      } catch (err) {
        console.error("Lead processing failed", id, err);
        await recordAndAlertFailure("facebook_lead_ads", { leadgenId: id }, `Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }));
    // Sequential on purpose: two quick messages from the same new person must
    // not both pass the "already known?" check and create duplicate customers.
    for (const { event, pageId } of messengerEvents) {
      try {
        await processMessengerEvent(event, pageId);
      } catch (err) {
        console.error("Messenger event failed", err);
        await recordAndAlertFailure("facebook_messenger", { event }, `Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Always a fast 200 so Meta does not retry the whole delivery.
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  return new Response("Not found", { status: 404 });
});
