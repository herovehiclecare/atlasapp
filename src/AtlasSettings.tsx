import { useState, useRef, useEffect } from "react";
import {
  LayoutGrid, Calendar, Users, Car, Receipt, Settings as SettingsIcon, Sparkles,
  MoreHorizontal, Pencil, Camera, Plus, Trash2, Building2, Tag, Percent,
  UserCog, Clock, Bell, SlidersHorizontal, ChevronRight, Lock, Eye, EyeOff,
  CalendarCheck, Globe, Copy, Check as CheckIcon, Image as ImageIcon, Plug, Loader2, ExternalLink, X, AlertCircle, ListChecks,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { useBusinessId } from "./useBusinessId";
import { resizeImageToDataUrl, useLiveClock, formatDateTime } from "./lib";

const P = {
  bg: "#06100C", bgTop: "#0B1813", surface: "#0F1B15", surfaceHover: "#132018",
  border: "#1E2E25", textPrimary: "#EDF6F1", textSecondary: "#92AA9D", textMuted: "#566B5E",
  accent: "#18D97A", accentHover: "#35E890", secondary: "#FF7A63",
  accentSoft: "rgba(24,217,122,0.14)", secondarySoft: "rgba(255,122,99,0.14)", danger: "#FF6B5E",
};
const HUES = ["#18D97A", "#4C8DFF", "#9B6BFF", "#F5A623", "#FF7A63", "#4FD1C5"];


function AtlasMark({ size = 24 }) {
  const gid = "atlas-globe-settings";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs><radialGradient id={gid} cx="36%" cy="30%" r="75%"><stop offset="0%" stopColor={P.accentHover} /><stop offset="100%" stopColor={P.accent} /></radialGradient></defs>
      <path d="M18 82 L49 33 L51 33 L82 82" stroke={P.accent} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="50" cy="31" r="18" fill={`url(#${gid})`} />
      <ellipse cx="44" cy="24" rx="6.5" ry="4.2" fill="rgba(255,255,255,0.38)" />
    </svg>
  );
}

const NAV = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutGrid }, { id: "customers", label: "Customers", Icon: Users },
  { id: "vehicles", label: "Vehicles", Icon: Car }, { id: "quote", label: "Atlas QuickQuote", Icon: Sparkles },
  { id: "schedule", label: "Schedule", Icon: Calendar }, { id: "followups", label: "Follow-ups", Icon: ListChecks },
  { id: "invoices", label: "Invoices", Icon: Receipt },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];
const MOBILE_NAV = [
  { id: "dashboard", label: "Home", Icon: LayoutGrid }, { id: "schedule", label: "Schedule", Icon: Calendar },
  { id: "customers", label: "Clients", Icon: Users }, { id: "invoices", label: "Invoices", Icon: Receipt },
  { id: "more", label: "More", Icon: MoreHorizontal },
];
// Pages that don't fit in the 5-slot mobile bottom bar — "More" opens a sheet listing these.
const MORE_PAGES = [
  { id: "vehicles", label: "Vehicles", Icon: Car }, { id: "quote", label: "Atlas QuickQuote", Icon: Sparkles },
  { id: "followups", label: "Follow-ups", Icon: ListChecks }, { id: "settings", label: "Settings", Icon: SettingsIcon },
];

const SECTIONS = [
  { id: "profile", label: "Business Profile", Icon: Building2 },
  { id: "services", label: "Services & Packages", Icon: Tag },
  { id: "booking", label: "Online Booking", Icon: CalendarCheck },
  { id: "page", label: "Public Business Page", Icon: Globe },
  { id: "integrations", label: "Integrations", Icon: Plug },
  { id: "taxes", label: "Taxes", Icon: Percent },
  { id: "employees", label: "Employees", Icon: UserCog },
  { id: "hours", label: "Business Hours", Icon: Clock },
  { id: "notifications", label: "Notifications", Icon: Bell },
  { id: "customize", label: "Customize", Icon: SlidersHorizontal },
  { id: "account", label: "Account", Icon: Lock },
];

const INITIAL_EMPLOYEES = [
  { id: "jake", name: "Jake R.", role: "Lead Detailer", email: "jake@detailhero.com", color: "#4C8DFF" },
  { id: "sofia", name: "Sofia M.", role: "Ceramic & PPF Specialist", email: "sofia@detailhero.com", color: "#9B6BFF" },
  { id: "tyler", name: "Tyler B.", role: "Mobile Detailer", email: "tyler@detailhero.com", color: "#F5A623" },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const INITIAL_HOURS = DAYS.map((d) => ({ day: d, open: !["Sunday"].includes(d), start: "8:00 AM", end: d === "Saturday" ? "3:00 PM" : "6:00 PM" }));

// These map directly to what the notification bell (top-right, on every page)
// actually shows — kept to real, working alerts only rather than listing
// notification types (SMS, email digests, etc.) that don't send anything yet.
const INITIAL_NOTIFICATIONS = [
  { id: "followUpOverdue", label: "Overdue follow-ups", sub: "Red dot + listed in the bell once a follow-up passes its due date", on: true },
  { id: "followUpToday", label: "Follow-ups due today", sub: "Listed in the bell for anything due today", on: true },
];

const INITIAL_CONDITIONS = [
  { id: "pets", label: "Pet hair present", ask: true, surcharge: 25, forceReview: false },
  { id: "heavySoil", label: "Heavy interior soiling (mud, food, spills)", ask: true, surcharge: 40, forceReview: false },
  { id: "smoke", label: "Smoke odor", ask: true, surcharge: 35, forceReview: false },
  { id: "biohazard", label: "Biohazard (bodily fluids, mold, pests)", ask: true, surcharge: 0, forceReview: true },
];

const INTEGRATIONS = [
  { id: "stripe", name: "Stripe", desc: "Accept card payments on invoices and online bookings.", category: "Payments" },
  { id: "quickbooks", name: "QuickBooks", desc: "Sync invoices and expenses for bookkeeping.", category: "Accounting" },
  { id: "gcal", name: "Google Calendar", desc: "Two-way sync with your Schedule.", category: "Calendar" },
  { id: "twilio", name: "Twilio", desc: "Send SMS quote links, reminders, and receipts.", category: "Messaging" },
  { id: "whatsapp", name: "WhatsApp Business", desc: "Free alternative to SMS for customer messaging.", category: "Messaging" },
  { id: "resend", name: "Resend", desc: "Deliver quote, invoice, and receipt emails.", category: "Email" },
];

function hue(i) { return HUES[i % HUES.length]; }
function initials(name) { return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(); }

/* ---------------------------------- shared chrome ---------------------------------- */

function NavItem({ item, active, onClick }) {
  const { Icon, label } = item;
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "9px 12px", borderRadius: 9, border: "none", cursor: "pointer", textAlign: "left", background: active ? P.surfaceHover : "transparent", color: active ? P.textPrimary : P.textSecondary }}>
      <Icon size={17} color={active ? P.accent : P.textMuted} />
      <span style={{ fontSize: 13.5, fontWeight: active ? 600 : 500 }}>{label}</span>
    </button>
  );
}

function BrandLockup({ size = 30, businessId, realName, realLogoUrl }) {
  const [logo, setLogo] = useState(null);
  const [name, setName] = useState("Detail Hero");
  const [editingName, setEditingName] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { if (realLogoUrl !== undefined) setLogo(realLogoUrl || null); }, [realLogoUrl]);
  useEffect(() => { if (realName) setName(realName); }, [realName]);

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file || !businessId) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, 256);
      setLogo(dataUrl);
      const { error } = await supabase.from("businesses").update({ logo_url: dataUrl }).eq("id", businessId).select().single();
      if (error) throw error;
    } catch (err) {
      alert(err.message || "Couldn't save that logo.");
    }
  }
  async function commitName() {
    setEditingName(false);
    if (businessId && name.trim()) await supabase.from("businesses").update({ name: name.trim() }).eq("id", businessId);
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button onClick={() => fileRef.current?.click()} title="Change logo" style={{ position: "relative", width: size, height: size, borderRadius: "50%", border: `1px solid ${P.border}`, background: logo ? `url(${logo}) center/cover` : P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0 }}>
        {!logo && <span style={{ fontSize: size * 0.36, fontWeight: 700, color: P.accent }}>{initials(name)}</span>}
        <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: P.accent, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${P.bg}` }}><Camera size={9} color={P.bg} /></div>
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} />
      {editingName ? (
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === "Enter" && commitName()} style={{ background: "transparent", border: "none", borderBottom: `1px solid ${P.accent}`, color: P.textPrimary, fontSize: 15, fontWeight: 700, outline: "none", width: 140 }} />
      ) : (
        <button onClick={() => setEditingName(true)} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: P.textPrimary }}>{name}</span>
          <Pencil size={11} color={P.textMuted} />
        </button>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: P.textSecondary, display: "block", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
const inputStyle = { width: "100%", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 9, padding: "9px 12px", color: P.textPrimary, fontSize: 13.5, outline: "none", boxSizing: "border-box" };

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} style={{ width: 40, height: 22, borderRadius: 20, border: "none", cursor: "pointer", background: on ? P.accent : P.border, position: "relative", flexShrink: 0, padding: 0 }}>
      <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: P.bg, transition: "left 0.15s ease" }} />
    </button>
  );
}

function Panel({ title, sub, children }) {
  return (
    <div>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: P.textPrimary, margin: "0 0 3px" }}>{title}</h2>
      {sub && <p style={{ fontSize: 12.5, color: P.textSecondary, margin: "0 0 18px" }}>{sub}</p>}
      {!sub && <div style={{ marginBottom: 14 }} />}
      {children}
    </div>
  );
}
function Card({ children, style }) {
  return <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, ...style }}>{children}</div>;
}

/* ---------------------------------- Business Profile ---------------------------------- */

function ProfilePanel() {
  const { businessId, businessName, businessLogoUrl, businessTagline, businessQuoteLabel, businessInvoiceLabel, loading: bizLoading } = useBusinessId();
  const [logo, setLogo] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tagline, setTagline] = useState("");
  const [savingTagline, setSavingTagline] = useState(false);
  const [taglineSaved, setTaglineSaved] = useState(false);
  const [quoteLabel, setQuoteLabel] = useState("");
  const [savingQuoteLabel, setSavingQuoteLabel] = useState(false);
  const [quoteLabelSaved, setQuoteLabelSaved] = useState(false);
  const [invoiceLabel, setInvoiceLabel] = useState("");
  const [savingInvoiceLabel, setSavingInvoiceLabel] = useState(false);
  const [invoiceLabelSaved, setInvoiceLabelSaved] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  useEffect(() => { setName(businessName); }, [businessName]);
  useEffect(() => { setLogo(businessLogoUrl || null); }, [businessLogoUrl]);
  useEffect(() => { setTagline(businessTagline); }, [businessTagline]);
  useEffect(() => { setQuoteLabel(businessQuoteLabel); }, [businessQuoteLabel]);
  useEffect(() => { setInvoiceLabel(businessInvoiceLabel); }, [businessInvoiceLabel]);

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file || !businessId) return;
    setUploadingLogo(true);
    setError("");
    try {
      const dataUrl = await resizeImageToDataUrl(file, 256);
      setLogo(dataUrl);
      const { error: updateError } = await supabase.from("businesses").update({ logo_url: dataUrl }).eq("id", businessId).select().single();
      if (updateError) throw updateError;
    } catch (err) {
      setError(err.message || "Couldn't save that logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function saveName() {
    if (!businessId || !name.trim()) return;
    setSaving(true);
    setError("");
    const { error: updateError } = await supabase.from("businesses").update({ name: name.trim() }).eq("id", businessId).select().single();
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  }

  async function saveTagline() {
    if (!businessId) return;
    setSavingTagline(true);
    setError("");
    const { error: updateError } = await supabase.from("businesses").update({ tagline: tagline.trim() || null }).eq("id", businessId).select().single();
    setSavingTagline(false);
    if (updateError) { setError(updateError.message); return; }
    setTaglineSaved(true);
    setTimeout(() => setTaglineSaved(false), 1600);
  }

  async function saveQuoteLabel() {
    if (!businessId) return;
    setSavingQuoteLabel(true);
    setError("");
    const { error: updateError } = await supabase.from("businesses").update({ quote_label: quoteLabel.trim() || null }).eq("id", businessId).select().single();
    setSavingQuoteLabel(false);
    if (updateError) { setError(updateError.message); return; }
    setQuoteLabelSaved(true);
    setTimeout(() => setQuoteLabelSaved(false), 1600);
  }

  async function saveInvoiceLabel() {
    if (!businessId) return;
    setSavingInvoiceLabel(true);
    setError("");
    const { error: updateError } = await supabase.from("businesses").update({ invoice_label: invoiceLabel.trim() || null }).eq("id", businessId).select().single();
    setSavingInvoiceLabel(false);
    if (updateError) { setError(updateError.message); return; }
    setInvoiceLabelSaved(true);
    setTimeout(() => setInvoiceLabelSaved(false), 1600);
  }

  return (
    <Panel title="Business Profile" sub="This is what customers see on quotes, invoices, and emails.">
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => fileRef.current?.click()} style={{ width: 64, height: 64, borderRadius: 14, border: `1px solid ${P.border}`, background: logo ? `url(${logo}) center/cover` : P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            {!logo && <span style={{ fontSize: 22, fontWeight: 700, color: P.accent }}>DH</span>}
            {uploadingLogo && <Loader2 size={16} className="animate-spin" color={P.accent} />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} />
          <div>
            <button onClick={() => fileRef.current?.click()} style={{ background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 8, padding: "7px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Upload logo</button>
            <p style={{ fontSize: 11.5, color: P.textMuted, margin: "6px 0 0" }}>PNG or JPG, square works best. Saved automatically — shown on quote and invoice PDFs.</p>
          </div>
        </div>
      </Card>

      {error && <p style={{ fontSize: 12.5, color: P.danger, margin: "0 0 12px" }}>{error}</p>}

      <style>{`@media (max-width: 640px) { .settings-profile-grid { grid-template-columns: 1fr !important; } }`}</style>
      <div className="settings-profile-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Business Name">
          <div style={{ display: "flex", gap: 8 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={bizLoading} style={{ ...inputStyle, flex: 1 }} />
            <button
              onClick={saveName}
              disabled={saving || bizLoading || !name.trim() || name === businessName}
              style={{ display: "flex", alignItems: "center", gap: 5, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 9, padding: "0 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0, opacity: (saving || bizLoading || !name.trim() || name === businessName) ? 0.5 : 1 }}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckIcon size={13} /> : "Save"}
            </button>
          </div>
        </Field>
        <Field label="Tagline">
          <div style={{ display: "flex", gap: 8 }}>
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} disabled={bizLoading} placeholder="e.g. Skill, knowledge, perfection." style={{ ...inputStyle, flex: 1 }} />
            <button
              onClick={saveTagline}
              disabled={savingTagline || bizLoading || tagline === businessTagline}
              style={{ display: "flex", alignItems: "center", gap: 5, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 9, padding: "0 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0, opacity: (savingTagline || bizLoading || tagline === businessTagline) ? 0.5 : 1 }}
            >
              {savingTagline ? <Loader2 size={13} className="animate-spin" /> : taglineSaved ? <CheckIcon size={13} /> : "Save"}
            </button>
          </div>
        </Field>
        <Field label="Quote document label">
          <div style={{ display: "flex", gap: 8 }}>
            <input value={quoteLabel} onChange={(e) => setQuoteLabel(e.target.value)} disabled={bizLoading} placeholder="SERVICE QUOTE" style={{ ...inputStyle, flex: 1 }} />
            <button
              onClick={saveQuoteLabel}
              disabled={savingQuoteLabel || bizLoading || quoteLabel === businessQuoteLabel}
              style={{ display: "flex", alignItems: "center", gap: 5, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 9, padding: "0 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0, opacity: (savingQuoteLabel || bizLoading || quoteLabel === businessQuoteLabel) ? 0.5 : 1 }}
            >
              {savingQuoteLabel ? <Loader2 size={13} className="animate-spin" /> : quoteLabelSaved ? <CheckIcon size={13} /> : "Save"}
            </button>
          </div>
        </Field>
        <Field label="Invoice document label">
          <div style={{ display: "flex", gap: 8 }}>
            <input value={invoiceLabel} onChange={(e) => setInvoiceLabel(e.target.value)} disabled={bizLoading} placeholder="INVOICE" style={{ ...inputStyle, flex: 1 }} />
            <button
              onClick={saveInvoiceLabel}
              disabled={savingInvoiceLabel || bizLoading || invoiceLabel === businessInvoiceLabel}
              style={{ display: "flex", alignItems: "center", gap: 5, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 9, padding: "0 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0, opacity: (savingInvoiceLabel || bizLoading || invoiceLabel === businessInvoiceLabel) ? 0.5 : 1 }}
            >
              {savingInvoiceLabel ? <Loader2 size={13} className="animate-spin" /> : invoiceLabelSaved ? <CheckIcon size={13} /> : "Save"}
            </button>
          </div>
        </Field>
        <Field label="Phone"><input defaultValue="(407) 555-0134" style={inputStyle} /></Field>
        <Field label="Email"><input defaultValue="hello@detailhero.com" style={inputStyle} /></Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Address"><input defaultValue="1204 Ridge Rd, Sanford, FL 32771" style={inputStyle} /></Field>
        </div>
      </div>
      <p style={{ fontSize: 11, color: P.textMuted, marginTop: 14 }}>Business Name, logo, Tagline, and the Quote/Invoice document labels are saved for real — quotes and invoices pull from here. Phone, Email, and Address aren't backed by a database column yet, so they reset on reload.</p>
    </Panel>
  );
}

/* ---------------------------------- Services & Packages ---------------------------------- */

function PriceField({ label, value, onChange, onBlur }) {
  return (
    <div>
      <label style={{ fontSize: 10.5, fontWeight: 600, color: P.textMuted, display: "block", marginBottom: 4 }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 3, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 8, padding: "6px 8px" }}>
        <span style={{ fontSize: 12, color: P.textMuted }}>$</span>
        <input type="number" value={value ?? ""} onChange={onChange} onBlur={onBlur} placeholder="—" style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: P.textPrimary, fontSize: 12.5 }} />
      </div>
    </div>
  );
}

function ServiceCard({ service, onUpdateLocal, onPersist, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const includes = service.includes || [];

  function set(field, value) { onUpdateLocal({ ...service, [field]: value }); }
  function commit() { onPersist(service); }
  function setNum(field, raw) { set(field, raw === "" ? null : Number(raw)); }

  function updateBullet(i, value) {
    const next = [...includes];
    next[i] = value;
    onUpdateLocal({ ...service, includes: next });
  }
  function commitIncludes() { onPersist({ ...service, includes }); }
  function removeBullet(i) {
    const updated = { ...service, includes: includes.filter((_, idx) => idx !== i) };
    onUpdateLocal(updated);
    onPersist(updated);
  }
  function addBullet() {
    onUpdateLocal({ ...service, includes: [...includes, ""] });
    setExpanded(true);
  }

  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <input value={service.name} onChange={(e) => set("name", e.target.value)} onBlur={commit} style={{ ...inputStyle, fontWeight: 700, fontSize: 14, padding: "6px 8px" }} />
          <input value={service.category || ""} onChange={(e) => set("category", e.target.value)} onBlur={commit} placeholder="Category, e.g. Maintenance Detailing" style={{ ...inputStyle, fontSize: 12, color: P.textSecondary, padding: "6px 8px" }} />
        </div>
        <button onClick={onDelete} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", flexShrink: 0 }}><Trash2 size={15} /></button>
      </div>

      <div style={{ padding: "0 16px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8 }}>
        <PriceField label="Car" value={service.price_car_low} onChange={(e) => setNum("price_car_low", e.target.value)} onBlur={commit} />
        <PriceField label="SUV/Truck/Van" value={service.price_suv_low} onChange={(e) => setNum("price_suv_low", e.target.value)} onBlur={commit} />
      </div>

      <button onClick={() => setExpanded((v) => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", borderTop: `1px solid ${P.border}`, padding: "9px 16px", cursor: "pointer", color: P.textSecondary, fontSize: 12, fontWeight: 600 }}>
        What's included ({includes.length})
        <ChevronRight size={13} style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }} />
      </button>

      {expanded && (
        <div style={{ padding: "10px 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          {includes.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input value={item} onChange={(e) => updateBullet(i, e.target.value)} onBlur={commitIncludes} placeholder="e.g. Ceramic soap hand wash" style={{ ...inputStyle, flex: 1, padding: "6px 8px", fontSize: 12.5 }} />
              <button onClick={() => removeBullet(i)} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", flexShrink: 0 }}><X size={13} /></button>
            </div>
          ))}
          <button onClick={addBullet} style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px dashed ${P.border}`, color: P.textMuted, borderRadius: 7, padding: "6px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", alignSelf: "flex-start" }}>
            <Plus size={11} /> Add bullet
          </button>
        </div>
      )}
    </Card>
  );
}

function ServicesPanel() {
  const { businessId } = useBusinessId();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase.from("services").select("*").eq("business_id", businessId).order("sort_order", { ascending: true });
      if (cancelled) return;
      if (fetchError) setError(fetchError.message);
      else setServices(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  function updateLocal(id, next) { setServices((list) => list.map((s) => (s.id === id ? next : s))); }

  async function persist(service) {
    const { error: updateError } = await supabase.from("services").update({
      name: service.name,
      category: service.category,
      price_car_low: service.price_car_low,
      price_car_high: service.price_car_high,
      price_suv_low: service.price_suv_low,
      price_suv_high: service.price_suv_high,
      deposit_required: service.deposit_required,
      includes: service.includes,
    }).eq("id", service.id);
    if (updateError) setError(updateError.message);
  }
  async function deleteService(id) {
    setServices((list) => list.filter((s) => s.id !== id));
    const { error: deleteError } = await supabase.from("services").delete().eq("id", id);
    if (deleteError) setError(deleteError.message);
  }
  async function addService() {
    if (!businessId) return;
    const nextSort = services.length ? Math.max(...services.map((s) => s.sort_order || 0)) + 1 : 1;
    const { data, error: insertError } = await supabase
      .from("services")
      .insert({ business_id: businessId, name: "New Service", category: "", price_car_low: null, includes: [], sort_order: nextSort })
      .select()
      .single();
    if (insertError) { setError(insertError.message); return; }
    setServices((list) => [...list, data]);
  }

  return (
    <Panel title="Services & Packages" sub="This is the same list Atlas QuickQuote and Invoices price against — edit here, and it updates there.">
      {error && <p style={{ fontSize: 12.5, color: P.danger, margin: "0 0 12px" }}>{error}</p>}
      {loading ? (
        <p style={{ fontSize: 13, color: P.textMuted }}>Loading…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {services.map((s) => (
            <ServiceCard key={s.id} service={s} onUpdateLocal={(next) => updateLocal(s.id, next)} onPersist={persist} onDelete={() => deleteService(s.id)} />
          ))}
          <button onClick={addService} disabled={!businessId} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "transparent", border: `1px dashed ${P.border}`, color: P.textMuted, borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 600, cursor: businessId ? "pointer" : "default", opacity: businessId ? 1 : 0.6 }}>
            <Plus size={14} /> Add service
          </button>
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------------- Online Booking ---------------------------------- */

function BookingPanel() {
  const { businessId } = useBusinessId();
  const [enabled, setEnabled] = useState(true);
  const [realServices, setRealServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [bookable, setBookable] = useState({});
  const [leadTime, setLeadTime] = useState("24 hours");
  const [buffer, setBuffer] = useState("30 min");
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [depositRequired, setDepositRequired] = useState(true);
  const [depositPercent, setDepositPercent] = useState(25);
  const [copied, setCopied] = useState(false);
  const [conditions, setConditions] = useState(INITIAL_CONDITIONS);
  const [requirePhotos, setRequirePhotos] = useState(true);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      setLoadingServices(true);
      const { data } = await supabase.from("services").select("id, name, price_car_low").eq("business_id", businessId).order("sort_order", { ascending: true });
      if (cancelled) return;
      setRealServices(data || []);
      setBookable(Object.fromEntries((data || []).map((s) => [s.id, true])));
      setLoadingServices(false);
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  function toggleService(id) { setBookable((b) => ({ ...b, [id]: !b[id] })); }
  function updateCondition(id, field, value) { setConditions((c) => c.map((x) => (x.id === id ? { ...x, [field]: value } : x))); }
  function removeCondition(id) { setConditions((c) => c.filter((x) => x.id !== id)); }
  function addCondition() {
    const id = `cond-${Date.now()}`;
    setConditions((c) => [...c, { id, label: "New condition question", ask: true, surcharge: 0, forceReview: false }]);
  }
  function copyLink() {
    try { navigator.clipboard?.writeText("https://atlas.page/detailhero/book"); } catch (e) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Panel title="Online Booking" sub="Let customers grab an open slot themselves instead of calling or texting.">
      <Card style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>Allow online booking</div>
          <div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>Turns your booking link on or off entirely.</div>
        </div>
        <Toggle on={enabled} onClick={() => setEnabled((v) => !v)} />
      </Card>

      {enabled && (
        <>
          <Card style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Globe size={15} color={P.accent} />
              <span style={{ fontSize: 13, color: P.textSecondary, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>atlas.page/detailhero/book</span>
            </div>
            <button onClick={copyLink} style={{ display: "flex", alignItems: "center", gap: 5, background: copied ? P.accentSoft : "transparent", border: `1px solid ${copied ? P.accent : P.border}`, color: copied ? P.accent : P.textSecondary, borderRadius: 8, padding: "6px 11px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
              {copied ? <CheckIcon size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy link"}
            </button>
          </Card>

          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, marginBottom: 8 }}>Bookable services</div>
          <Card style={{ marginBottom: 16 }}>
            {loadingServices ? (
              <div style={{ padding: "14px 16px", fontSize: 12.5, color: P.textMuted }}>Loading…</div>
            ) : realServices.length === 0 ? (
              <div style={{ padding: "14px 16px", fontSize: 12.5, color: P.textMuted }}>No services yet — add some under Services &amp; Packages first.</div>
            ) : (
              realServices.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: i < realServices.length - 1 ? `1px solid ${P.border}` : "none" }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: P.textPrimary }}>{s.name}</div><div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>{s.price_car_low != null ? `$${s.price_car_low}` : "No price set"}</div></div>
                  <Toggle on={bookable[s.id] ?? true} onClick={() => toggleService(s.id)} />
                </div>
              ))
            )}
          </Card>
          <p style={{ fontSize: 11.5, color: P.textMuted, margin: "-8px 0 16px" }}>Pulled live from Services &amp; Packages. Online booking itself isn't a working feature yet, so these toggles aren't saved.</p>

          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, marginBottom: 8 }}>Booking rules</div>
          <Card style={{ padding: 16, marginBottom: 16 }}>
            <style>{`@media (max-width: 640px) { .settings-booking-grid { grid-template-columns: 1fr !important; } }`}</style>
            <div className="settings-booking-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <Field label="Minimum lead time">
                <select value={leadTime} onChange={(e) => setLeadTime(e.target.value)} style={inputStyle}>
                  {["Same day", "24 hours", "48 hours", "1 week"].map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Buffer between jobs">
                <select value={buffer} onChange={(e) => setBuffer(e.target.value)} style={inputStyle}>
                  {["None", "15 min", "30 min", "1 hour"].map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: `1px solid ${P.border}` }}>
              <div><div style={{ fontSize: 13, fontWeight: 600, color: P.textPrimary }}>Require approval</div><div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>Off = booked instantly. On = you confirm first.</div></div>
              <Toggle on={!autoConfirm} onClick={() => setAutoConfirm((v) => !v)} />
            </div>
          </Card>

          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, marginBottom: 8 }}>Deposit</div>
          <Card style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div><div style={{ fontSize: 13, fontWeight: 600, color: P.textPrimary }}>Require deposit to book</div><div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>Charged via Stripe at time of booking.</div></div>
              <Toggle on={depositRequired} onClick={() => setDepositRequired((v) => !v)} />
            </div>
            {depositRequired && (
              <div style={{ marginTop: 14, maxWidth: 160 }}>
                <Field label="Deposit (%)">
                  <input type="number" value={depositPercent} onChange={(e) => setDepositPercent(Number(e.target.value) || 0)} style={inputStyle} />
                </Field>
              </div>
            )}
          </Card>

          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, margin: "18px 0 8px" }}>Vehicle condition disclosure</div>
          <p style={{ fontSize: 11.5, color: P.textMuted, margin: "-2px 0 10px" }}>
            Ask before they book, not after you show up. A "yes" can add a surcharge automatically, or force the booking into manual review instead of auto-confirming.
          </p>
          <Card>
            {conditions.map((c, i) => (
              <div key={c.id} style={{ padding: "12px 16px", borderBottom: i < conditions.length - 1 ? `1px solid ${P.border}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                    <AlertCircle size={14} color={c.forceReview ? P.danger : P.textMuted} style={{ flexShrink: 0 }} />
                    <input
                      value={c.label}
                      onChange={(e) => updateCondition(c.id, "label", e.target.value)}
                      style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", borderBottom: `1px solid transparent`, color: P.textPrimary, fontSize: 13, fontWeight: 600, outline: "none", padding: "2px 0" }}
                      onFocus={(e) => (e.target.style.borderBottomColor = P.accent)}
                      onBlur={(e) => (e.target.style.borderBottomColor = "transparent")}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <Toggle on={c.ask} onClick={() => updateCondition(c.id, "ask", !c.ask)} />
                    <button onClick={() => removeCondition(c.id)} title="Remove this question" style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex" }}><Trash2 size={13} /></button>
                  </div>
                </div>
                {c.ask && (
                  <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 10, marginLeft: 24, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: P.textSecondary }}>
                      Surcharge $
                      <input type="number" value={c.surcharge} onChange={(e) => updateCondition(c.id, "surcharge", Number(e.target.value) || 0)} disabled={c.forceReview} style={{ width: 60, background: P.bgTop, border: `1px solid ${P.border}`, borderRadius: 6, padding: "4px 7px", color: c.forceReview ? P.textMuted : P.textPrimary, fontSize: 12, outline: "none" }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: P.textSecondary, cursor: "pointer" }}>
                      <input type="checkbox" checked={c.forceReview} onChange={(e) => updateCondition(c.id, "forceReview", e.target.checked)} style={{ accentColor: P.danger }} />
                      Always require my approval if flagged
                    </label>
                  </div>
                )}
              </div>
            ))}
            <div style={{ padding: "10px 16px" }}>
              <button onClick={addCondition} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px dashed ${P.border}`, color: P.textMuted, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Plus size={13} /> Add a custom question
              </button>
            </div>
          </Card>

          <Card style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: P.textPrimary }}>Require condition photos</div>
              <div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>Customer must upload at least 1 photo before the booking confirms — self-reports aren't always accurate.</div>
            </div>
            <Toggle on={requirePhotos} onClick={() => setRequirePhotos((v) => !v)} />
          </Card>
        </>
      )}
    </Panel>
  );
}

/* ---------------------------------- Public Business Page ---------------------------------- */

function PublicPagePanel() {
  const { businessId, businessName, businessLogoUrl, businessTagline } = useBusinessId();
  const [published, setPublished] = useState(true);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [sections, setSections] = useState({ services: true, gallery: true, reviews: true, bookNow: true });
  const [photos, setPhotos] = useState([]);
  const [realServices, setRealServices] = useState([]);
  const [featuredServiceIds, setFeaturedServiceIds] = useState(null); // null = "all" until services load
  const fileRef = useRef(null);

  useEffect(() => {
    if (businessName && !slugTouched) setSlug(businessName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
  }, [businessName, slugTouched]);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("services").select("id, name, price_car_low").eq("business_id", businessId).order("sort_order", { ascending: true });
      if (cancelled) return;
      setRealServices(data || []);
      setFeaturedServiceIds((current) => current ?? (data || []).map((s) => s.id));
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  function toggleSection(key) { setSections((s) => ({ ...s, [key]: !s[key] })); }
  function toggleFeatured(id) {
    setFeaturedServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
  const featuredServices = realServices.filter((s) => (featuredServiceIds || []).includes(s.id));
  function onPick(e) {
    Array.from(e.target.files || []).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPhotos((p) => [...p, reader.result]);
      reader.readAsDataURL(file);
    });
  }


  return (
    <Panel title="Public Business Page" sub="A hosted page customers can find, browse, and book from — like a landing page, no website needed.">
      <Card style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>Publish my business page</div>
          <div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>Makes your page publicly visible at the link below.</div>
        </div>
        <Toggle on={published} onClick={() => setPublished((v) => !v)} />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }} className="settings-page-grid">
        <div>
          <Field label="Page URL">
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 9, padding: "9px 12px" }}>
              <span style={{ fontSize: 12.5, color: P.textMuted, whiteSpace: "nowrap" }}>atlas.page/</span>
              <input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: P.textPrimary, fontSize: 13 }} />
            </div>
          </Field>

          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, margin: "18px 0 8px" }}>Sections to show</div>
          <Card>
            {[
              { key: "services", label: "Services & pricing" },
              { key: "gallery", label: "Photo gallery" },
              { key: "reviews", label: "Customer reviews" },
              { key: "bookNow", label: "Book Now button" },
            ].map((row, i, arr) => (
              <div key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${P.border}` : "none" }}>
                <span style={{ fontSize: 13, color: P.textPrimary }}>{row.label}</span>
                <Toggle on={sections[row.key]} onClick={() => toggleSection(row.key)} />
              </div>
            ))}
          </Card>

          {sections.services && (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, margin: "18px 0 8px" }}>Which services to feature</div>
              <Card>
                {realServices.length === 0 ? (
                  <div style={{ padding: "12px 16px", fontSize: 12.5, color: P.textMuted }}>Add services under Services &amp; Packages to feature them here.</div>
                ) : (
                  realServices.map((s, i) => (
                    <label key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: i < realServices.length - 1 ? `1px solid ${P.border}` : "none", cursor: "pointer" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input type="checkbox" checked={(featuredServiceIds || []).includes(s.id)} onChange={() => toggleFeatured(s.id)} style={{ accentColor: P.accent }} />
                        <span style={{ fontSize: 13, color: P.textPrimary }}>{s.name}</span>
                      </span>
                      <span style={{ fontSize: 11.5, color: P.textMuted }}>{s.price_car_low != null ? `$${s.price_car_low}` : "No price set"}</span>
                    </label>
                  ))
                )}
              </Card>
            </>
          )}

          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, margin: "18px 0 8px" }}>Gallery photos</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
            <button onClick={() => fileRef.current?.click()} style={{ aspectRatio: "1", border: `1px dashed ${P.border}`, borderRadius: 10, background: "transparent", color: P.textMuted, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, cursor: "pointer" }}>
              <ImageIcon size={16} /> <span style={{ fontSize: 9.5 }}>Add</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: "none" }} />
            {photos.map((src, i) => (
              <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: `1px solid ${P.border}` }}>
                <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={10} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* live preview */}
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, marginBottom: 8 }}>Live preview</div>
          <div style={{ border: `1px solid ${P.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: P.bgTop, borderBottom: `1px solid ${P.border}` }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: P.border }} /><span style={{ width: 7, height: 7, borderRadius: "50%", background: P.border }} /><span style={{ width: 7, height: 7, borderRadius: "50%", background: P.border }} />
              <span style={{ fontSize: 10, color: P.textMuted, marginLeft: 6, fontFamily: "'JetBrains Mono', monospace" }}>atlas.page/{slug || "your-page"}</span>
            </div>
            <div style={{ background: P.surface, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: businessLogoUrl ? `url(${businessLogoUrl}) center/cover` : P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: P.accent, flexShrink: 0 }}>{!businessLogoUrl && initials(businessName || "Detail Hero")}</div>
                <div><div style={{ fontSize: 14, fontWeight: 700, color: P.textPrimary }}>{businessName || "Detail Hero"}</div><div style={{ fontSize: 10.5, color: P.textMuted }}>{businessTagline || "Add a tagline in Business Profile"}</div></div>
              </div>

              {sections.services && (
                <div style={{ marginBottom: 14 }}>
                  {featuredServices.length === 0 ? (
                    <div style={{ fontSize: 11, color: P.textMuted, fontStyle: "italic" }}>
                      {realServices.length === 0 ? "Add services under Services & Packages to show them here." : 'No services selected — pick some under "Which services to feature."'}
                    </div>
                  ) : (
                    featuredServices.map((s) => (
                      <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: P.textSecondary, padding: "5px 0", borderBottom: `1px solid ${P.border}` }}>
                        <span>{s.name}</span><span style={{ color: P.textPrimary, fontWeight: 600 }}>{s.price_car_low != null ? `$${s.price_car_low}` : "—"}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {sections.gallery && (
                <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
                  {(photos.length ? photos.slice(0, 3) : [null, null, null]).map((src, i) => (
                    <div key={i} style={{ flex: 1, aspectRatio: "1", borderRadius: 7, background: src ? `url(${src}) center/cover` : P.bgTop, border: `1px solid ${P.border}` }} />
                  ))}
                </div>
              )}

              {sections.reviews && (
                <div style={{ fontSize: 11, color: P.textSecondary, marginBottom: 14, fontStyle: "italic" }}>★★★★★ "Best detail shop in Sanford." — Priya S.</div>
              )}

              {sections.bookNow && (
                <button style={{ width: "100%", background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 9, padding: "10px", fontSize: 12.5, fontWeight: 700, cursor: "default" }}>Book Now</button>
              )}
            </div>
          </div>
          {!published && <p style={{ fontSize: 11, color: P.textMuted, marginTop: 8, textAlign: "center" }}>Page is unpublished — only you can see this preview.</p>}
        </div>
      </div>
      <style>{`@media (max-width: 640px) { .settings-page-grid { grid-template-columns: 1fr !important; } }`}</style>
    </Panel>
  );
}

/* ---------------------------------- Integrations ---------------------------------- */

function IntegrationRow({ item, state, onConnect, onDisconnect }) {
  const status = state?.status || "idle";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: P.accent }}>
        {item.name[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>{item.name}</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: P.textMuted, background: P.bgTop, border: `1px solid ${P.border}`, borderRadius: 20, padding: "1px 7px" }}>{item.category}</span>
        </div>
        <div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>{item.desc}</div>
      </div>
      {status === "connected" ? (
        <button onClick={() => onDisconnect(item.id)} style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 8, padding: "7px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
          <CheckIcon size={12} color={P.accent} /> Connected
        </button>
      ) : status === "connecting" ? (
        <button disabled style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${P.border}`, color: P.textMuted, borderRadius: 8, padding: "7px 12px", fontSize: 11.5, fontWeight: 600, flexShrink: 0 }}>
          <Loader2 size={12} className="animate-spin" /> Connecting…
        </button>
      ) : (
        <button onClick={() => onConnect(item.id)} style={{ display: "flex", alignItems: "center", gap: 5, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 8, padding: "7px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
          <ExternalLink size={12} /> Connect
        </button>
      )}
    </div>
  );
}

function IntegrationsPanel() {
  const [connections, setConnections] = useState({ stripe: { status: "connected" } });

  function connect(id) {
    setConnections((c) => ({ ...c, [id]: { status: "connecting" } }));
    setTimeout(() => setConnections((c) => ({ ...c, [id]: { status: "connected" } })), 1000);
  }
  function disconnect(id) {
    setConnections((c) => ({ ...c, [id]: { status: "idle" } }));
  }

  return (
    <Panel title="Integrations" sub="Connect the tools Atlas uses to actually send, charge, and sync things.">
      <Card>
        {INTEGRATIONS.map((item, i) => (
          <div key={item.id} style={{ borderBottom: i < INTEGRATIONS.length - 1 ? `1px solid ${P.border}` : "none" }}>
            <IntegrationRow item={item} state={connections[item.id]} onConnect={connect} onDisconnect={disconnect} />
          </div>
        ))}
      </Card>
      <p style={{ fontSize: 11.5, color: P.textMuted, marginTop: 14 }}>
        These connect buttons are simulated in this preview. In the live app, each one opens that provider's real authorization flow.
      </p>
    </Panel>
  );
}

/* ---------------------------------- Taxes ---------------------------------- */

function TaxesPanel() {
  const { businessId, businessTaxEnabled, businessDefaultTaxRate, loading: bizLoading } = useBusinessId();
  const [enabled, setEnabled] = useState(true);
  const [rate, setRate] = useState(7);
  const [error, setError] = useState("");

  useEffect(() => { setEnabled(businessTaxEnabled); }, [businessTaxEnabled]);
  useEffect(() => { setRate(businessDefaultTaxRate); }, [businessDefaultTaxRate]);

  async function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    if (!businessId) return;
    const { error: updateError } = await supabase.from("businesses").update({ tax_enabled: next }).eq("id", businessId).select().single();
    if (updateError) setError(updateError.message);
  }
  async function commitRate() {
    if (!businessId) return;
    const { error: updateError } = await supabase.from("businesses").update({ default_tax_rate: rate }).eq("id", businessId).select().single();
    if (updateError) setError(updateError.message);
  }

  return (
    <Panel title="Taxes" sub="Turn tax on or off for your whole business — new quotes and invoices pick up this default, and you can still override it per document.">
      {error && <p style={{ fontSize: 12.5, color: P.danger, margin: "0 0 12px" }}>{error}</p>}
      <Card style={{ padding: 18, maxWidth: 360 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>Charge tax</div>
            <div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>When off, new quotes and invoices default to no tax and won't show a tax line.</div>
          </div>
          <Toggle on={enabled} onClick={toggleEnabled} />
        </div>
        {enabled && (
          <div style={{ marginTop: 16 }}>
            <Field label="Default tax rate (%)">
              <input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} onBlur={commitRate} disabled={bizLoading} style={inputStyle} />
            </Field>
          </div>
        )}
      </Card>
    </Panel>
  );
}

/* ---------------------------------- Employees ---------------------------------- */

function EmployeesPanel() {
  const { businessId } = useBusinessId();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase.from("employees").select("*").eq("business_id", businessId).order("created_at", { ascending: true });
      if (cancelled) return;
      if (fetchError) setError(fetchError.message);
      else setEmployees(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  function updateLocal(id, field, value) {
    setEmployees((list) => list.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  }
  async function persist(id) {
    const emp = employees.find((e) => e.id === id);
    if (!emp) return;
    const { error: updateError } = await supabase.from("employees").update({ name: emp.name, role: emp.role }).eq("id", id);
    if (updateError) setError(updateError.message);
  }
  async function remove(id) {
    setEmployees((list) => list.filter((e) => e.id !== id));
    const { error: deleteError } = await supabase.from("employees").delete().eq("id", id);
    if (deleteError) setError(deleteError.message);
  }
  async function add() {
    if (!businessId) return;
    const { data, error: insertError } = await supabase
      .from("employees")
      .insert({ business_id: businessId, name: "New Employee", role: "Detailer", color: hue(employees.length) })
      .select()
      .single();
    if (insertError) { setError(insertError.message); return; }
    setEmployees((list) => [...list, data]);
  }

  return (
    <Panel title="Employees" sub="Technicians shown on Schedule and assigned to jobs.">
      {error && <p style={{ fontSize: 12.5, color: P.danger, margin: "0 0 12px" }}>{error}</p>}
      {loading ? (
        <p style={{ fontSize: 13, color: P.textMuted }}>Loading…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {employees.map((e) => (
            <Card key={e.id} style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: `${e.color}25`, color: e.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {e.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <input value={e.name} onChange={(ev) => updateLocal(e.id, "name", ev.target.value)} onBlur={() => persist(e.id)} style={{ ...inputStyle, flex: 1 }} />
              <input value={e.role} onChange={(ev) => updateLocal(e.id, "role", ev.target.value)} onBlur={() => persist(e.id)} style={{ ...inputStyle, flex: 1 }} />
              <button onClick={() => remove(e.id)} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", flexShrink: 0 }}><Trash2 size={15} /></button>
            </Card>
          ))}
          <button onClick={add} disabled={!businessId} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "transparent", border: `1px dashed ${P.border}`, color: P.textMuted, borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 600, cursor: businessId ? "pointer" : "default", opacity: businessId ? 1 : 0.6 }}>
            <Plus size={14} /> Add employee
          </button>
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------------- Business Hours ---------------------------------- */

function HoursPanel() {
  const { businessId, businessHours } = useBusinessId();
  const [hours, setHours] = useState(INITIAL_HOURS);
  const [error, setError] = useState("");

  useEffect(() => {
    if (businessHours && businessHours.length > 0) setHours(businessHours);
  }, [businessHours]);

  async function persist(nextHours) {
    if (!businessId) return;
    const { error: updateError } = await supabase.from("businesses").update({ hours: nextHours }).eq("id", businessId).select().single();
    if (updateError) setError(updateError.message);
  }
  function updateOpen(day, open) {
    setHours((list) => {
      const next = list.map((h) => (h.day === day ? { ...h, open } : h));
      persist(next);
      return next;
    });
  }
  function updateTimeLocal(day, field, value) {
    setHours((list) => list.map((h) => (h.day === day ? { ...h, [field]: value } : h)));
  }
  function commitTimes() { persist(hours); }

  return (
    <Panel title="Business Hours" sub="Used to keep Schedule from suggesting times you're closed.">
      {error && <p style={{ fontSize: 12.5, color: P.danger, margin: "0 0 12px" }}>{error}</p>}
      <Card>
        {hours.map((h, i) => (
          <div key={h.day} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 16px", borderBottom: i < hours.length - 1 ? `1px solid ${P.border}` : "none" }}>
            <Toggle on={h.open} onClick={() => updateOpen(h.day, !h.open)} />
            <span style={{ fontSize: 13, fontWeight: 600, color: P.textPrimary, width: 90, flexShrink: 0 }}>{h.day}</span>
            {h.open ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <input value={h.start} onChange={(e) => updateTimeLocal(h.day, "start", e.target.value)} onBlur={commitTimes} style={{ ...inputStyle, flex: 1 }} />
                <span style={{ color: P.textMuted, fontSize: 12 }}>to</span>
                <input value={h.end} onChange={(e) => updateTimeLocal(h.day, "end", e.target.value)} onBlur={commitTimes} style={{ ...inputStyle, flex: 1 }} />
              </div>
            ) : (
              <span style={{ fontSize: 12.5, color: P.textMuted }}>Closed</span>
            )}
          </div>
        ))}
      </Card>
    </Panel>
  );
}

/* ---------------------------------- Notifications ---------------------------------- */

function NotificationsPanel() {
  const { businessId, businessNotificationPrefs } = useBusinessId();
  const [items, setItems] = useState(INITIAL_NOTIFICATIONS);
  const [error, setError] = useState("");

  useEffect(() => {
    if (businessNotificationPrefs && Object.keys(businessNotificationPrefs).length > 0) {
      setItems((list) => list.map((n) => ({ ...n, on: businessNotificationPrefs[n.id] ?? n.on })));
    }
  }, [businessNotificationPrefs]);

  async function toggle(id) {
    const next = items.map((n) => (n.id === id ? { ...n, on: !n.on } : n));
    setItems(next);
    if (!businessId) return;
    const nextPrefs = Object.fromEntries(next.map((n) => [n.id, n.on]));
    const { error: updateError } = await supabase.from("businesses").update({ notification_prefs: nextPrefs }).eq("id", businessId).select().single();
    if (updateError) setError(updateError.message);
  }

  return (
    <Panel title="Notifications" sub="Controls the notification bell in the top-right corner of every page.">
      {error && <p style={{ fontSize: 12.5, color: P.danger, margin: "0 0 12px" }}>{error}</p>}
      <Card>
        {items.map((n, i) => (
          <div key={n.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 16px", borderBottom: i < items.length - 1 ? `1px solid ${P.border}` : "none" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: P.textPrimary }}>{n.label}</div>
              {n.sub && <div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>{n.sub}</div>}
            </div>
            <Toggle on={n.on} onClick={() => toggle(n.id)} />
          </div>
        ))}
      </Card>
    </Panel>
  );
}

/* ---------------------------------- Customize ---------------------------------- */

function CustomizePanel() {
  const { businessId, businessUiPrefs } = useBusinessId();
  const [dash, setDash] = useState({ profitBanner: true, insights: true, aiFab: true });
  const [sched, setSched] = useState({ stats: true, ai: true });
  const [error, setError] = useState("");

  useEffect(() => {
    if (businessUiPrefs?.dashboard) setDash((d) => ({ ...d, ...businessUiPrefs.dashboard }));
    if (businessUiPrefs?.schedule) setSched((s) => ({ ...s, ...businessUiPrefs.schedule }));
  }, [businessUiPrefs]);

  // Dashboard and Schedule each persist a bigger sub-object (they have their
  // own page-local toggles Settings doesn't expose), so a naive top-level
  // merge here would wipe out the keys this panel doesn't know about —
  // this reads the current sub-object first and only touches the one key.
  async function togglePageKey(page, setLocal, current, k) {
    const nextValue = !current[k];
    setLocal({ ...current, [k]: nextValue });
    if (!businessId) return;
    try {
      const { data, error: fetchError } = await supabase.from("businesses").select("ui_prefs").eq("id", businessId).single();
      if (fetchError) throw fetchError;
      const merged = { ...(data?.ui_prefs || {}), [page]: { ...(data?.ui_prefs?.[page] || {}), [k]: nextValue } };
      const { error: updateError } = await supabase.from("businesses").update({ ui_prefs: merged }).eq("id", businessId);
      if (updateError) throw updateError;
    } catch (err) { setError(err.message); }
  }
  const toggleDash = (k) => togglePageKey("dashboard", setDash, dash, k);
  const toggleSched = (k) => togglePageKey("schedule", setSched, sched, k);

  return (
    <Panel title="Customize" sub="Set what shows by default on each page — this replaces the per-page Customize toggle.">
      {error && <p style={{ fontSize: 12.5, color: P.danger, margin: "0 0 12px" }}>{error}</p>}
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, marginBottom: 8 }}>Dashboard</div>
      <Card style={{ marginBottom: 18 }}>
        {[
          { key: "profitBanner", label: "Profit banner", sub: "Cost setup prompt / today's profit" },
          { key: "insights", label: "Atlas AI insights panel", sub: "Follow-ups, unpaid invoices, booking gaps" },
          { key: "aiFab", label: "Floating AI assistant button", sub: "Bottom-right shortcut to Atlas AI" },
        ].map((row, i, arr) => (
          <div key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${P.border}` : "none" }}>
            <div><div style={{ fontSize: 13, fontWeight: 600, color: P.textPrimary }}>{row.label}</div><div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>{row.sub}</div></div>
            <Toggle on={dash[row.key]} onClick={() => toggleDash(row.key)} />
          </div>
        ))}
      </Card>

      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, marginBottom: 8 }}>Schedule</div>
      <Card>
        {[
          { key: "stats", label: "Jobs & Hours stats", sub: "Monthly totals above the calendar" },
          { key: "ai", label: "Atlas AI panel", sub: "Pacing and open-day nudges" },
        ].map((row, i, arr) => (
          <div key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${P.border}` : "none" }}>
            <div><div style={{ fontSize: 13, fontWeight: 600, color: P.textPrimary }}>{row.label}</div><div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>{row.sub}</div></div>
            <Toggle on={sched[row.key]} onClick={() => toggleSched(row.key)} />
          </div>
        ))}
      </Card>
    </Panel>
  );
}

/* ---------------------------------- Account ---------------------------------- */

function AccountPanel() {
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) { setEmail(data.user.email); setNewEmail(data.user.email); }
    });
  }, []);

  async function changeEmail(e) {
    e.preventDefault();
    if (!newEmail.trim() || newEmail === email) return;
    setEmailSaving(true);
    setEmailError("");
    setEmailSaved(false);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailSaving(false);
    if (error) { setEmailError(error.message); return; }
    setEmailSaved(true);
  }

  async function changePassword(e) {
    e.preventDefault();
    if (password.length < 6) { setPasswordError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setPasswordError("Passwords don't match."); return; }
    setPasswordSaving(true);
    setPasswordError("");
    setPasswordSaved(false);
    const { error } = await supabase.auth.updateUser({ password });
    setPasswordSaving(false);
    if (error) { setPasswordError(error.message); return; }
    setPassword("");
    setConfirmPassword("");
    setPasswordSaved(true);
    setTimeout(() => setPasswordSaved(false), 2000);
  }

  return (
    <Panel title="Account" sub="Manage the login email and password for your Atlas account.">
      <Card style={{ padding: 18, marginBottom: 16, maxWidth: 420 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary, marginBottom: 4 }}>Login email</div>
        <div style={{ fontSize: 12, color: P.textMuted, marginBottom: 14 }}>Changing this sends a confirmation link to the new address — the change won't take effect until you click it.</div>
        <form onSubmit={changeEmail} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {emailError && <div style={{ fontSize: 12.5, color: P.danger }}>{emailError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <input type="email" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); setEmailSaved(false); }} style={{ ...inputStyle, flex: 1 }} />
            <button
              type="submit"
              disabled={emailSaving || !newEmail.trim() || newEmail === email}
              style={{ display: "flex", alignItems: "center", gap: 5, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 9, padding: "0 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0, opacity: (emailSaving || !newEmail.trim() || newEmail === email) ? 0.5 : 1 }}
            >
              {emailSaving ? <Loader2 size={13} className="animate-spin" /> : emailSaved ? <CheckIcon size={13} /> : "Update email"}
            </button>
          </div>
          {emailSaved && <p style={{ fontSize: 12, color: P.accent, margin: 0 }}>Check {newEmail} for a confirmation link to finish the change.</p>}
        </form>
      </Card>

      <Card style={{ padding: 18, maxWidth: 420 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary, marginBottom: 4 }}>Change password</div>
        <div style={{ fontSize: 12, color: P.textMuted, marginBottom: 14 }}>No need to enter your current password — you're already signed in.</div>
        <form onSubmit={changePassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {passwordError && <div style={{ fontSize: 12.5, color: P.danger }}>{passwordError}</div>}
          <Field label="New password">
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                style={{ ...inputStyle, paddingRight: 38 }}
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password visibility"
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex" }}>
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>
          <Field label="Confirm new password">
            <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle} />
          </Field>
          <button
            type="submit" disabled={passwordSaving}
            style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 9, padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: passwordSaving ? "default" : "pointer", opacity: passwordSaving ? 0.7 : 1 }}
          >
            {passwordSaving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : passwordSaved ? <><CheckIcon size={13} /> Saved</> : "Save new password"}
          </button>
        </form>
      </Card>
    </Panel>
  );
}

const PANELS = {
  profile: ProfilePanel, services: ServicesPanel, booking: BookingPanel, page: PublicPagePanel,
  integrations: IntegrationsPanel, taxes: TaxesPanel,
  employees: EmployeesPanel, hours: HoursPanel, notifications: NotificationsPanel, customize: CustomizePanel,
  account: AccountPanel,
};

/* ---------------------------------- page ---------------------------------- */

export default function AtlasSettings({ onNavigate, currentPage = "settings", onSignOut }) {
  const { businessId, businessName, businessLogoUrl } = useBusinessId();
  const now = useLiveClock();
  const [section, setSection] = useState("profile");
  const [moreOpen, setMoreOpen] = useState(false);
  const ActivePanel = PANELS[section];

  return (
    <div style={{ minHeight: "100vh", background: P.bg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      {/* SIDEBAR */}
      <div className="hidden lg:flex" style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${P.border}`, flexDirection: "column", padding: "22px 14px", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px", marginBottom: 28 }}>
          <AtlasMark size={24} /><span style={{ fontSize: 16, fontWeight: 700, color: P.textPrimary }}>Atlas</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {NAV.map((item) => <NavItem key={item.id} item={item} active={currentPage === item.id} onClick={() => onNavigate(item.id)} />)}
        </div>
        <div style={{ marginTop: "auto", padding: "10px 8px", borderTop: `1px solid ${P.border}`, paddingTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: businessLogoUrl ? `url(${businessLogoUrl}) center/cover` : P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: P.accent }}>{!businessLogoUrl && initials(businessName || "Detail Hero")}</div>
            <div><div style={{ fontSize: 12.5, fontWeight: 600, color: P.textPrimary }}>{businessName || "Detail Hero"}</div><div style={{ fontSize: 11, color: P.textMuted }}>Owner</div></div>
          </div>
          {onSignOut && (
            <button onClick={onSignOut} style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", color: P.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "4px 2px" }}>
              Sign out
            </button>
          )}
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 88 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 24px", borderBottom: `1px solid ${P.border}`, position: "sticky", top: 0, background: P.bg, zIndex: 10 }}>
          <BrandLockup size={30} businessId={businessId} realName={businessName} realLogoUrl={businessLogoUrl} />
          <div className="hidden lg:flex" style={{ alignItems: "center", gap: 14 }}>
            <div style={{ width: 1, height: 20, background: P.border }} />
            <span style={{ fontSize: 13, color: P.textSecondary }}>Settings <span style={{ color: P.textMuted }}>· {formatDateTime(now)}</span></span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 24, padding: "22px 24px", maxWidth: 980, margin: "0 auto" }}>
          {/* sub-nav */}
          <div className="hidden md:flex" style={{ flexDirection: "column", gap: 2, width: 200, flexShrink: 0 }}>
            {SECTIONS.map((s) => (
              <button key={s.id} onClick={() => setSection(s.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, border: "none", background: section === s.id ? P.surfaceHover : "transparent", color: section === s.id ? P.textPrimary : P.textSecondary, cursor: "pointer", textAlign: "left" }}>
                <s.Icon size={15} color={section === s.id ? P.accent : P.textMuted} />
                <span style={{ fontSize: 13, fontWeight: section === s.id ? 600 : 500 }}>{s.label}</span>
              </button>
            ))}
          </div>

          {/* mobile section picker */}
          <div className="flex md:hidden" style={{ position: "fixed", top: 62, left: 0, right: 0, background: P.bg, borderBottom: `1px solid ${P.border}`, padding: "8px 16px", gap: 6, overflowX: "auto", zIndex: 9 }}>
            {SECTIONS.map((s) => (
              <button key={s.id} onClick={() => setSection(s.id)} style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 20, border: `1px solid ${section === s.id ? P.accent : P.border}`, background: section === s.id ? P.accentSoft : "transparent", color: section === s.id ? P.accent : P.textSecondary, cursor: "pointer" }}>
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 0, marginTop: 0 }} className="settings-content">
            <ActivePanel />
          </div>
        </div>
      </div>

      <div className="flex lg:hidden" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: P.bgTop, borderTop: `1px solid ${P.border}`, padding: "10px 6px 18px", justifyContent: "space-around", zIndex: 20 }}>
        {MOBILE_NAV.map((item) => {
          const isActive = item.id === "more" ? moreOpen : currentPage === item.id;
          return (
            <button key={item.id} onClick={() => (item.id === "more" ? setMoreOpen((v) => !v) : onNavigate(item.id))} style={{ background: "transparent", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer", color: isActive ? P.accent : P.textMuted }}>
              <item.Icon size={19} /><span style={{ fontSize: 10.5, fontWeight: isActive ? 600 : 500 }}>{item.label}</span>
            </button>
          );
        })}
      </div>
      {moreOpen && (
        <>
          <div className="flex lg:hidden" onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 21 }} />
          <div className="flex lg:hidden" style={{ position: "fixed", bottom: 84, left: 12, right: 12, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: 8, zIndex: 22, flexDirection: "column", gap: 2 }}>
            {MORE_PAGES.map((p) => (
              <button key={p.id} onClick={() => { onNavigate(p.id); setMoreOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 9, border: "none", background: currentPage === p.id ? P.surfaceHover : "transparent", color: currentPage === p.id ? P.textPrimary : P.textSecondary, cursor: "pointer", textAlign: "left" }}>
                <p.Icon size={16} color={currentPage === p.id ? P.accent : P.textMuted} />
                <span style={{ fontSize: 13.5, fontWeight: currentPage === p.id ? 600 : 500 }}>{p.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <style>{`@media (max-width: 767px) { .settings-content { margin-top: 46px; } }`}</style>
    </div>
  );
}
