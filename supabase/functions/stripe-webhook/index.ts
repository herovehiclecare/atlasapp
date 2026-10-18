import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Stripe webhook: marks an invoice paid when Checkout completes.
// Deploy with verify_jwt false (Stripe can't send a Supabase JWT); authenticity comes from
// verifying the Stripe-Signature header against STRIPE_WEBHOOK_SECRET.

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const enc = new TextEncoder();

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verify(raw: string, header: string): Promise<boolean> {
  if (!WEBHOOK_SECRET || !header) return false;
  const parts = header.split(",").map((p) => p.split("="));
  const t = parts.find((p) => p[0] === "t")?.[1];
  const sigs = parts.filter((p) => p[0] === "v1").map((p) => p[1]);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const expected = await hmacHex(WEBHOOK_SECRET, `${t}.${raw}`);
  return sigs.some((s) => safeEqual(s, expected));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Not found", { status: 404 });
  const raw = await req.text();
  if (!(await verify(raw, req.headers.get("stripe-signature") || ""))) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response("Bad payload", { status: 400 }); }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data?.object;
    const invoiceId = session?.metadata?.invoice_id;
    if (invoiceId && session.payment_status === "paid") {
      const tip = Number(session.metadata?.tip_amount) || 0;
      const { error } = await supabase.from("invoices").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_online: true,
        tip_amount: tip,
        stripe_session_id: session.id,
      }).eq("id", invoiceId);
      if (error) {
        console.error("mark paid failed", invoiceId, error);
        return new Response("DB error", { status: 500 });
      }
    }
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
