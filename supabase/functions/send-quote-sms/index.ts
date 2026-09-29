import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Texts a quote's interactive link straight to the customer's phone through
// Quo/OpenPhone, called from Atlas's own Send step when the business checks
// "Text message" and hits Send - previously that checkbox did nothing; the
// business had to copy the link and paste it into their own Messages app.
//
// verify_jwt is ON (unlike the public customer-facing functions) - this is
// an authenticated owner action, not a public webhook. The caller's JWT is
// used to confirm they're actually a member of the quote's business before
// anything gets sent, so one business can't use another's Quo credits by
// guessing a quote id.
//
// Secrets: QUO_API_KEY / QUO_FROM_NUMBER (same ones quote-portal uses for
// the approval alert).

const QUO_API_KEY = Deno.env.get("QUO_API_KEY") || "";
const QUO_FROM_NUMBER = Deno.env.get("QUO_FROM_NUMBER") || "";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function quotePortalUrl(shareToken: string): string {
  return `https://atlasapp-two.vercel.app/quote/${shareToken}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Not found", { status: 404 });

  if (!QUO_API_KEY || !QUO_FROM_NUMBER) {
    return new Response(JSON.stringify({ error: "Texting isn't set up for this business yet." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401, headers: { "Content-Type": "application/json" } });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Bad request" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const quoteId = body.quoteId;
  if (!quoteId) return new Response(JSON.stringify({ error: "Missing quoteId" }), { status: 400, headers: { "Content-Type": "application/json" } });

  const { data: quote, error: quoteError } = await supabaseAdmin
    .from("quotes")
    .select("id, business_id, share_token, customers(name, phone), businesses(name)")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteError || !quote) {
    return new Response(JSON.stringify({ error: "Quote not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  // Confirm the caller actually belongs to this quote's business - the
  // service-role client above bypasses RLS, so this check has to happen
  // explicitly instead of relying on the database to enforce it.
  const { data: membership } = await supabaseAdmin
    .from("business_members")
    .select("business_id")
    .eq("business_id", quote.business_id)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!membership) {
    return new Response(JSON.stringify({ error: "Not authorized for this quote." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const customerPhone = (quote as any).customers?.phone;
  if (!customerPhone) {
    return new Response(JSON.stringify({ error: "This customer has no phone number on file." }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  if (!quote.share_token) {
    return new Response(JSON.stringify({ error: "This quote doesn't have a shareable link yet - save it first." }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const businessName = (quote as any).businesses?.name || "your detailer";
  const customerFirst = ((quote as any).customers?.name || "").split(" ")[0] || "there";
  const link = quotePortalUrl(quote.share_token);
  const content = `Hi ${customerFirst}, here's your quote from ${businessName} — tap to view your options and approve: ${link}`;

  try {
    const res = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: QUO_API_KEY },
      body: JSON.stringify({ content, from: QUO_FROM_NUMBER, to: [customerPhone] }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Quote text send failed", res.status, errText);
      return new Response(JSON.stringify({ error: "The text didn't go through - try again or copy the link instead." }), { status: 502, headers: { "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("Quote text send threw", err);
    return new Response(JSON.stringify({ error: "The text didn't go through - try again or copy the link instead." }), { status: 502, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ success: true, sentTo: customerPhone }), { status: 200, headers: { "Content-Type": "application/json" } });
});
