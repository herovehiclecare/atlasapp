import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Customer-facing "pay this invoice" data + Stripe Checkout session creation.
//   GET  ?token=<pay_token>&format=json  -> invoice summary for the Vercel page (api/pay.js)
//   POST {token, tip}                    -> creates a Stripe Checkout Session, returns {url}
// The webhook (stripe-webhook) is what actually marks the invoice paid - never this function.
// Needs the STRIPE_SECRET_KEY secret; without it POST returns a clear "not set up" error.

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") || "https://atlasapp-two.vercel.app";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });

const SELECT = "id, amount, status, due_date, description, line_items, tip_amount, paid_at, paid_online, pay_token, customers(name), vehicles(label), businesses(name, logo_url, tagline, phone, email, online_payments_enabled)";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const token = url.searchParams.get("token") || "";
    if (!token) return json({ error: "Missing token" }, 400);
    const { data: inv } = await supabase.from("invoices").select(SELECT).eq("pay_token", token).maybeSingle();
    if (!inv) return json({ error: "Not found" }, 404);
    return json({
      invoice: {
        id: inv.id,
        amount: Number(inv.amount) || 0,
        status: inv.status,
        due_date: inv.due_date,
        description: inv.description,
        line_items: inv.line_items || [],
        tip_amount: Number(inv.tip_amount) || 0,
        paid_at: inv.paid_at,
      },
      customer: { name: inv.customers?.name || "" },
      vehicle: inv.vehicles?.label || "",
      business: inv.businesses || {},
      canPayOnline: !!inv.businesses?.online_payments_enabled && !!STRIPE_SECRET_KEY,
    });
  }

  if (req.method === "POST") {
    let body: any = {};
    try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
    const token = String(body.token || "");
    if (!token) return json({ error: "Missing token" }, 400);

    const { data: inv } = await supabase.from("invoices").select(SELECT).eq("pay_token", token).maybeSingle();
    if (!inv) return json({ error: "Not found" }, 404);
    if (inv.status === "paid") return json({ error: "This invoice is already paid." }, 400);
    if (!inv.businesses?.online_payments_enabled || !STRIPE_SECRET_KEY) return json({ error: "Online payment isn't available yet. Please pay the business directly." }, 400);

    const cents = Math.round((Number(inv.amount) || 0) * 100);
    if (cents < 50) return json({ error: "This invoice amount can't be paid online." }, 400);
    const tip = Math.max(0, Math.min(Number(body.tip) || 0, 1000));
    const tipCents = Math.round(tip * 100);

    const bizName = inv.businesses?.name || "Invoice";
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", `${PUBLIC_BASE_URL}/pay/${token}?paid=1`);
    form.set("cancel_url", `${PUBLIC_BASE_URL}/pay/${token}`);
    form.set("line_items[0][quantity]", "1");
    form.set("line_items[0][price_data][currency]", "usd");
    form.set("line_items[0][price_data][unit_amount]", String(cents));
    form.set("line_items[0][price_data][product_data][name]", `${bizName} - invoice INV-${String(inv.id).slice(0, 8).toUpperCase()}`);
    if (tipCents > 0) {
      form.set("line_items[1][quantity]", "1");
      form.set("line_items[1][price_data][currency]", "usd");
      form.set("line_items[1][price_data][unit_amount]", String(tipCents));
      form.set("line_items[1][price_data][product_data][name]", "Tip");
    }
    form.set("metadata[invoice_id]", inv.id);
    form.set("metadata[tip_amount]", String(tip));
    form.set("payment_intent_data[metadata][invoice_id]", inv.id);
    form.set("payment_intent_data[description]", `${bizName} invoice INV-${String(inv.id).slice(0, 8).toUpperCase()}`);

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const session = await res.json();
    if (!res.ok || !session.url) {
      console.error("stripe session failed", res.status, JSON.stringify(session));
      return json({ error: "We couldn't start the payment. Please try again or pay the business directly." }, 502);
    }
    await supabase.from("invoices").update({ stripe_session_id: session.id }).eq("id", inv.id);
    return json({ url: session.url });
  }

  return new Response("Not found", { status: 404, headers: cors });
});
