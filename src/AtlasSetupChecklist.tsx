import { useState, useEffect } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import { supabase } from "./supabaseClient";

const P = {
  surface: "#0F1B15", border: "#1E2E25", textPrimary: "#EDF6F1", textSecondary: "#92AA9D", textMuted: "#566B5E",
  accent: "#18D97A", accentSoft: "rgba(24,217,122,0.14)",
};

export default function AtlasSetupChecklist({ businessId, onNavigate }) {
  const hideKey = `atlas_setup_hidden_${businessId}`;
  const siteKey = `atlas_setup_site_${businessId}`;
  const read = (k) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
  const [hidden, setHidden] = useState(() => read(hideKey));
  const [siteDone, setSiteDone] = useState(() => read(siteKey));
  const [s, setS] = useState(null);

  useEffect(() => {
    if (!businessId || hidden) return;
    let cancelled = false;
    (async () => {
      const [biz, svc, qts, quoteLeads] = await Promise.all([
        supabase.from("businesses").select("logo_url, phone, estimate_slug, estimate_enabled").eq("id", businessId).single(),
        supabase.from("services").select("id", { count: "exact", head: true }).eq("business_id", businessId),
        supabase.from("quotes").select("id", { count: "exact", head: true }).eq("business_id", businessId).neq("status", "draft"),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("source", "estimate_request"),
      ]);
      if (cancelled || biz.error) return;
      setS({
        profile: !!(biz.data.logo_url && biz.data.phone),
        services: (svc.count || 0) > 0,
        page: !!(biz.data.estimate_enabled && biz.data.estimate_slug),
        gotRequest: (quoteLeads.count || 0) > 0,
        quote: (qts.count || 0) > 0,
      });
    })();
    return () => { cancelled = true; };
  }, [businessId, hidden]);

  if (!businessId || hidden || !s) return null;

  const steps = [
    { done: s.profile, title: "Add your logo and phone number", sub: "They show on your quotes and invoices.", go: () => onNavigate("settings", { section: "profile" }) },
    { done: s.services, title: "Add your services and prices", sub: "This is what customers pick from.", go: () => onNavigate("settings", { section: "services" }) },
    { done: s.page, title: "Turn on your Instant Quote page", sub: "Customers see a price range and send you the request.", go: () => onNavigate("settings", { section: "instantquote" }) },
    { done: s.gotRequest || siteDone, title: "Put the quote form on your website", sub: "Copy the website code or share the link. Tap Done once it's up.", go: () => onNavigate("settings", { section: "instantquote" }), markDone: () => { try { localStorage.setItem(siteKey, "1"); } catch { /* ignore */ } setSiteDone(true); } },
    { done: s.quote, title: "Send your first quote", sub: "Pick a customer, choose the work, and send the link.", go: () => onNavigate("quote") },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  if (doneCount === steps.length) return null;
  const next = steps.findIndex((x) => !x.done);

  function hide() { try { localStorage.setItem(hideKey, "1"); } catch { /* ignore */ } setHidden(true); }

  return (
    <div style={{ background: P.surface, border: `1px solid ${P.accent}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "14px 18px 12px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: P.textPrimary }}>Get set up · {doneCount} of {steps.length} done</div>
          <div style={{ fontSize: 12, color: P.textSecondary, marginTop: 2 }}>A few quick steps and you're ready to take your first customer.</div>
        </div>
        <button onClick={hide} aria-label="Hide checklist" title="Hide" style={{ background: "none", border: "none", color: P.textMuted, cursor: "pointer", padding: 2, flexShrink: 0 }}><X size={16} /></button>
      </div>
      <div style={{ height: 4, background: P.border, margin: "0 18px 6px", borderRadius: 4 }}>
        <div style={{ height: "100%", width: `${(doneCount / steps.length) * 100}%`, background: P.accent, borderRadius: 4, transition: "width .3s" }} />
      </div>
      {steps.map((st, i) => (
        <div key={st.title} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: `1px solid ${P.border}`, opacity: st.done ? 0.55 : 1 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: st.done ? P.accent : "transparent", border: `2px solid ${st.done ? P.accent : P.border}` }}>
            {st.done && <Check size={13} color="#06100C" strokeWidth={3} />}
          </div>
          <button onClick={st.go} style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: P.textPrimary, textDecoration: st.done ? "line-through" : "none" }}>{st.title}</div>
            {!st.done && <div style={{ fontSize: 12, color: P.textSecondary, marginTop: 2 }}>{st.sub}</div>}
          </button>
          {!st.done && st.markDone && <button onClick={st.markDone} style={{ background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>Done</button>}
          {!st.done && <button onClick={st.go} style={{ display: "flex", alignItems: "center", gap: 3, background: i === next ? P.accentSoft : "transparent", border: `1px solid ${i === next ? P.accent : P.border}`, color: i === next ? P.accent : P.textSecondary, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>{i === next ? "Start" : "Open"} <ChevronRight size={12} /></button>}
        </div>
      ))}
    </div>
  );
}
