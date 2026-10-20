import { useState, useRef, useEffect } from "react";
import {
  LayoutGrid, Calendar, Users, Car, Receipt, Settings as SettingsIcon, Sparkles,
  MoreHorizontal, Pencil, Camera, Plus, Trash2, Building2, Tag, Percent,
  UserCog, Clock, Bell, SlidersHorizontal, ChevronRight, Lock, Eye, EyeOff,
  CalendarCheck, Globe, Copy, Check as CheckIcon, Image as ImageIcon, Plug, Loader2, ExternalLink, X, AlertCircle, ListChecks, ChevronUp, ChevronDown, MessageSquare,
} from "lucide-react";
import { Inbox as LeadsIcon } from "lucide-react";
import { supabase } from "./supabaseClient";
import { useBusinessId } from "./useBusinessId";
import { pushSupport, currentSubscription, enablePush, disablePush } from "./push";
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
  { id: "dashboard", label: "Dashboard", Icon: LayoutGrid }, { id: "leads", label: "Leads", Icon: LeadsIcon }, { id: "customers", label: "Customers", Icon: Users },
  { id: "vehicles", label: "Vehicles", Icon: Car }, { id: "quote", label: "Atlas QuickQuote", Icon: Sparkles },
  { id: "schedule", label: "Schedule", Icon: Calendar }, { id: "followups", label: "Follow-ups", Icon: ListChecks },
  { id: "invoices", label: "Invoices", Icon: Receipt },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];
const MOBILE_NAV = [
  { id: "dashboard", label: "Home", Icon: LayoutGrid }, { id: "schedule", label: "Schedule", Icon: Calendar },
  { id: "leads", label: "Leads", Icon: LeadsIcon }, { id: "invoices", label: "Invoices", Icon: Receipt },
  { id: "more", label: "More", Icon: MoreHorizontal },
];
// Pages that don't fit in the 5-slot mobile bottom bar — "More" opens a sheet listing these.
const MORE_PAGES = [
  { id: "customers", label: "Customers", Icon: Users },
  { id: "vehicles", label: "Vehicles", Icon: Car }, { id: "quote", label: "Atlas QuickQuote", Icon: Sparkles },
  { id: "followups", label: "Follow-ups", Icon: ListChecks }, { id: "settings", label: "Settings", Icon: SettingsIcon },
];

const SECTIONS = [
  { id: "profile", label: "Business Profile", Icon: Building2 },
  { id: "services", label: "Services & Packages", Icon: Tag },
  { id: "instantquote", label: "Instant Quote", Icon: Sparkles },
  { id: "booking", label: "Online Booking", Icon: CalendarCheck },
  { id: "page", label: "Public Business Page", Icon: Globe },
  { id: "integrations", label: "Integrations", Icon: Plug },
  { id: "taxes", label: "Taxes", Icon: Percent },
  { id: "employees", label: "Employees", Icon: UserCog },
  { id: "hours", label: "Business Hours", Icon: Clock },
  { id: "notifications", label: "Notifications", Icon: Bell },
  { id: "automations", label: "Automations", Icon: MessageSquare },
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
  const [name, setName] = useState("My Business");
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
        {!logo && <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: P.accent, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${P.bg}` }}><Camera size={9} color={P.bg} /></div>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} />
      {editingName ? (
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === "Enter" && commitName()} style={{ background: "transparent", border: "none", borderBottom: `1px solid ${P.accent}`, color: P.textPrimary, fontSize: 15, fontWeight: 700, outline: "none", width: 140 }} />
      ) : (
        <button onClick={() => setEditingName(true)} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: P.textPrimary }}>{name}</span>
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
  const { businessId, businessName, businessLogoUrl, businessTagline, businessQuoteLabel, businessInvoiceLabel, businessPhone, businessEmail, businessAddress, businessWebsite, businessSocialLinks, businessPreferredCommApp, loading: bizLoading } = useBusinessId();
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
  const [phone, setPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [email, setEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [address, setAddress] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressSaved, setAddressSaved] = useState(false);
  const [website, setWebsite] = useState("");
  const [savingWebsite, setSavingWebsite] = useState(false);
  const [websiteSaved, setWebsiteSaved] = useState(false);
  const [socialLinks, setSocialLinks] = useState({ instagram: "", facebook: "", tiktok: "", google: "" });
  const [savingSocial, setSavingSocial] = useState(false);
  const [socialSaved, setSocialSaved] = useState(false);
  const [commApp, setCommApp] = useState("native");
  const [savingCommApp, setSavingCommApp] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  useEffect(() => { setName(businessName); }, [businessName]);
  useEffect(() => { setLogo(businessLogoUrl || null); }, [businessLogoUrl]);
  useEffect(() => { setTagline(businessTagline); }, [businessTagline]);
  useEffect(() => { setQuoteLabel(businessQuoteLabel); }, [businessQuoteLabel]);
  useEffect(() => { setInvoiceLabel(businessInvoiceLabel); }, [businessInvoiceLabel]);
  useEffect(() => { setPhone(businessPhone); }, [businessPhone]);
  useEffect(() => { setEmail(businessEmail); }, [businessEmail]);
  useEffect(() => { setAddress(businessAddress); }, [businessAddress]);
  useEffect(() => { setWebsite(businessWebsite); }, [businessWebsite]);
  useEffect(() => { setSocialLinks({ instagram: "", facebook: "", tiktok: "", google: "", ...businessSocialLinks }); }, [businessSocialLinks]);
  useEffect(() => { setCommApp(businessPreferredCommApp || "native"); }, [businessPreferredCommApp]);

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

  async function savePhone() {
    if (!businessId) return;
    setSavingPhone(true);
    setError("");
    const { error: updateError } = await supabase.from("businesses").update({ phone: phone.trim() || null }).eq("id", businessId).select().single();
    setSavingPhone(false);
    if (updateError) { setError(updateError.message); return; }
    setPhoneSaved(true);
    setTimeout(() => setPhoneSaved(false), 1600);
  }

  async function saveEmail() {
    if (!businessId) return;
    setSavingEmail(true);
    setError("");
    const { error: updateError } = await supabase.from("businesses").update({ email: email.trim() || null }).eq("id", businessId).select().single();
    setSavingEmail(false);
    if (updateError) { setError(updateError.message); return; }
    setEmailSaved(true);
    setTimeout(() => setEmailSaved(false), 1600);
  }

  async function saveAddress() {
    if (!businessId) return;
    setSavingAddress(true);
    setError("");
    const { error: updateError } = await supabase.from("businesses").update({ address: address.trim() || null }).eq("id", businessId).select().single();
    setSavingAddress(false);
    if (updateError) { setError(updateError.message); return; }
    setAddressSaved(true);
    setTimeout(() => setAddressSaved(false), 1600);
  }

  async function saveWebsite() {
    if (!businessId) return;
    setSavingWebsite(true);
    setError("");
    const { error: updateError } = await supabase.from("businesses").update({ website: website.trim() || null }).eq("id", businessId).select().single();
    setSavingWebsite(false);
    if (updateError) { setError(updateError.message); return; }
    setWebsiteSaved(true);
    setTimeout(() => setWebsiteSaved(false), 1600);
  }

  async function saveSocialLinks() {
    if (!businessId) return;
    setSavingSocial(true);
    setError("");
    const cleaned = Object.fromEntries(Object.entries(socialLinks).map(([k, v]) => [k, (v || "").trim()]).filter(([, v]) => v));
    const { error: updateError } = await supabase.from("businesses").update({ social_links: cleaned }).eq("id", businessId).select().single();
    setSavingSocial(false);
    if (updateError) { setError(updateError.message); return; }
    setSocialLinks({ instagram: "", facebook: "", tiktok: "", google: "", ...cleaned });
    setSocialSaved(true);
    setTimeout(() => setSocialSaved(false), 1600);
  }

  async function saveCommApp(value) {
    setCommApp(value);
    if (!businessId) return;
    setSavingCommApp(true);
    setError("");
    const { error: updateError } = await supabase.from("businesses").update({ preferred_comm_app: value }).eq("id", businessId).select().single();
    setSavingCommApp(false);
    if (updateError) setError(updateError.message);
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
        <Field label="Phone">
          <div style={{ display: "flex", gap: 8 }}>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={bizLoading} placeholder="(407) 555-0134" style={{ ...inputStyle, flex: 1 }} />
            <button
              onClick={savePhone}
              disabled={savingPhone || bizLoading || phone === businessPhone}
              style={{ display: "flex", alignItems: "center", gap: 5, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 9, padding: "0 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0, opacity: (savingPhone || bizLoading || phone === businessPhone) ? 0.5 : 1 }}
            >
              {savingPhone ? <Loader2 size={13} className="animate-spin" /> : phoneSaved ? <CheckIcon size={13} /> : "Save"}
            </button>
          </div>
        </Field>
        <Field label="Email">
          <div style={{ display: "flex", gap: 8 }}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={bizLoading} placeholder="hello@detailhero.com" style={{ ...inputStyle, flex: 1 }} />
            <button
              onClick={saveEmail}
              disabled={savingEmail || bizLoading || email === businessEmail}
              style={{ display: "flex", alignItems: "center", gap: 5, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 9, padding: "0 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0, opacity: (savingEmail || bizLoading || email === businessEmail) ? 0.5 : 1 }}
            >
              {savingEmail ? <Loader2 size={13} className="animate-spin" /> : emailSaved ? <CheckIcon size={13} /> : "Save"}
            </button>
          </div>
        </Field>
        <Field label="Website">
          <div style={{ display: "flex", gap: 8 }}>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} disabled={bizLoading} placeholder="detailhero.com" style={{ ...inputStyle, flex: 1 }} />
            <button
              onClick={saveWebsite}
              disabled={savingWebsite || bizLoading || website === businessWebsite}
              style={{ display: "flex", alignItems: "center", gap: 5, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 9, padding: "0 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0, opacity: (savingWebsite || bizLoading || website === businessWebsite) ? 0.5 : 1 }}
            >
              {savingWebsite ? <Loader2 size={13} className="animate-spin" /> : websiteSaved ? <CheckIcon size={13} /> : "Save"}
            </button>
          </div>
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Address">
            <div style={{ display: "flex", gap: 8 }}>
              <input value={address} onChange={(e) => setAddress(e.target.value)} disabled={bizLoading} placeholder="1204 Ridge Rd, Sanford, FL 32771" style={{ ...inputStyle, flex: 1 }} />
              <button
                onClick={saveAddress}
                disabled={savingAddress || bizLoading || address === businessAddress}
                style={{ display: "flex", alignItems: "center", gap: 5, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 9, padding: "0 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0, opacity: (savingAddress || bizLoading || address === businessAddress) ? 0.5 : 1 }}
              >
                {savingAddress ? <Loader2 size={13} className="animate-spin" /> : addressSaved ? <CheckIcon size={13} /> : "Save"}
              </button>
            </div>
          </Field>
        </div>
      </div>

      <Card style={{ padding: 16, marginTop: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: P.textPrimary, marginBottom: 4 }}>Social links</div>
        <p style={{ fontSize: 11.5, color: P.textMuted, margin: "0 0 12px" }}>Shown at the bottom of the interactive quote page, along with your logo, phone, and website.</p>
        <div className="settings-profile-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Instagram">
            <input value={socialLinks.instagram} onChange={(e) => setSocialLinks((s) => ({ ...s, instagram: e.target.value }))} disabled={bizLoading} placeholder="instagram.com/detailhero" style={inputStyle} />
          </Field>
          <Field label="Facebook">
            <input value={socialLinks.facebook} onChange={(e) => setSocialLinks((s) => ({ ...s, facebook: e.target.value }))} disabled={bizLoading} placeholder="facebook.com/detailhero" style={inputStyle} />
          </Field>
          <Field label="TikTok">
            <input value={socialLinks.tiktok} onChange={(e) => setSocialLinks((s) => ({ ...s, tiktok: e.target.value }))} disabled={bizLoading} placeholder="tiktok.com/@detailhero" style={inputStyle} />
          </Field>
          <Field label="Google Reviews">
            <input value={socialLinks.google} onChange={(e) => setSocialLinks((s) => ({ ...s, google: e.target.value }))} disabled={bizLoading} placeholder="g.page/r/..." style={inputStyle} />
          </Field>
        </div>
        <button
          onClick={saveSocialLinks}
          disabled={savingSocial || bizLoading}
          style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 12, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", opacity: (savingSocial || bizLoading) ? 0.5 : 1 }}
        >
          {savingSocial ? <Loader2 size={13} className="animate-spin" /> : socialSaved ? <CheckIcon size={13} /> : "Save social links"}
        </button>
      </Card>

      <div style={{ marginTop: 18 }}>
        <Field label="Open calls/texts in">
          <select value={commApp} onChange={(e) => saveCommApp(e.target.value)} disabled={savingCommApp || bizLoading} style={inputStyle}>
            <option value="native">Native phone app (default)</option>
            <option value="quo">Quo (formerly OpenPhone)</option>
          </select>
        </Field>
        <p style={{ fontSize: 11, color: P.textMuted, margin: "6px 0 0" }}>Applies to Call/Text buttons across Atlas — Customers, Follow-ups, and Schedule. Quo only opens if it's installed on the device you tap from.</p>
      </div>

      <p style={{ fontSize: 11, color: P.textMuted, marginTop: 14 }}>All fields here are saved for real — quotes and invoices pull from here.</p>
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

function DurationField({ value, onChange, onBlur }) {
  return (
    <div>
      <label style={{ fontSize: 10.5, fontWeight: 600, color: P.textMuted, display: "block", marginBottom: 4 }}>Duration (optional)</label>
      <div style={{ display: "flex", alignItems: "center", gap: 3, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 8, padding: "6px 8px" }}>
        <input type="number" step="0.25" min="0" value={value ?? ""} onChange={onChange} onBlur={onBlur} placeholder="—" style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: P.textPrimary, fontSize: 12.5 }} />
        <span style={{ fontSize: 11, color: P.textMuted, flexShrink: 0 }}>hrs</span>
      </div>
    </div>
  );
}

function ServiceCard({ service, onUpdateLocal, onPersist, onDelete, onDuplicate, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
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
  function moveBullet(i, direction) {
    const j = i + direction;
    if (j < 0 || j >= includes.length) return;
    const next = [...includes];
    [next[i], next[j]] = [next[j], next[i]];
    onUpdateLocal({ ...service, includes: next });
    onPersist({ ...service, includes: next });
  }
  function addBullet() {
    onUpdateLocal({ ...service, includes: [...includes, ""] });
    setExpanded(true);
  }

  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0, marginTop: 2 }}>
          <button onClick={onMoveUp} disabled={!canMoveUp} title="Move up" style={{ background: "transparent", border: "none", color: canMoveUp ? P.textSecondary : P.border, cursor: canMoveUp ? "pointer" : "default", padding: 0, display: "flex" }}><ChevronUp size={15} /></button>
          <button onClick={onMoveDown} disabled={!canMoveDown} title="Move down" style={{ background: "transparent", border: "none", color: canMoveDown ? P.textSecondary : P.border, cursor: canMoveDown ? "pointer" : "default", padding: 0, display: "flex" }}><ChevronDown size={15} /></button>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <input value={service.name} onChange={(e) => set("name", e.target.value)} onBlur={commit} style={{ ...inputStyle, fontWeight: 700, fontSize: 14, padding: "6px 8px" }} />
          <input value={service.category || ""} onChange={(e) => set("category", e.target.value)} onBlur={commit} placeholder="Category, e.g. Maintenance Detailing" style={{ ...inputStyle, fontSize: 12, color: P.textSecondary, padding: "6px 8px" }} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 4, flexShrink: 0 }}>
          <button onClick={onDuplicate} title="Duplicate this service" style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer" }}><Copy size={14} /></button>
          <button onClick={onDelete} title="Delete this service" style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer" }}><Trash2 size={15} /></button>
        </div>
      </div>

      <div style={{ padding: "0 16px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8 }}>
        <PriceField label="Car" value={service.price_car_low} onChange={(e) => setNum("price_car_low", e.target.value)} onBlur={commit} />
        <PriceField label="SUV/Truck/Van" value={service.price_suv_low} onChange={(e) => setNum("price_suv_low", e.target.value)} onBlur={commit} />
        <DurationField value={service.duration_hours} onChange={(e) => setNum("duration_hours", e.target.value)} onBlur={commit} />
      </div>

      <div style={{ padding: "0 16px 14px" }}>
        <label style={{ fontSize: 10.5, fontWeight: 600, color: P.textMuted, display: "block", marginBottom: 4 }}>Description</label>
        <textarea
          value={service.description || ""}
          onChange={(e) => set("description", e.target.value)}
          onBlur={commit}
          placeholder="Plain-text description customers see, e.g. paste in a paragraph instead of listing bullet points."
          rows={2}
          style={{ ...inputStyle, width: "100%", padding: "8px 10px", fontSize: 12.5, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
        />
      </div>

      <button onClick={() => setExpanded((v) => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", borderTop: `1px solid ${P.border}`, padding: "9px 16px", cursor: "pointer", color: P.textSecondary, fontSize: 12, fontWeight: 600 }}>
        What's included ({includes.length})
        <ChevronRight size={13} style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }} />
      </button>

      {expanded && (
        <div style={{ padding: "10px 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          {includes.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
                <button onClick={() => moveBullet(i, -1)} disabled={i === 0} title="Move up" style={{ background: "transparent", border: "none", color: i === 0 ? P.border : P.textMuted, cursor: i === 0 ? "default" : "pointer", padding: 0, display: "flex" }}><ChevronUp size={12} /></button>
                <button onClick={() => moveBullet(i, 1)} disabled={i === includes.length - 1} title="Move down" style={{ background: "transparent", border: "none", color: i === includes.length - 1 ? P.border : P.textMuted, cursor: i === includes.length - 1 ? "default" : "pointer", padding: 0, display: "flex" }}><ChevronDown size={12} /></button>
              </div>
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

// Preferred display order for known categories — anything else (a category
// the owner typed in that isn't one of these, or blank) sorts after, in
// alphabetical order, with blank/no-category services grouped last under
// "Uncategorized" so a service never just silently disappears from view.
const CATEGORY_ORDER = ["Mobile Maintenance", "Ceramic Coatings", "Paint Correction", "Add-Ons"];
function categoryRank(category) {
  const idx = CATEGORY_ORDER.indexOf(category);
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}
function groupServices(list) {
  const groups = {};
  for (const s of list) {
    const key = (s.category || "").trim() || "Uncategorized";
    (groups[key] ||= []).push(s);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => {
      const ra = categoryRank(a === "Uncategorized" ? "\0" : a);
      const rb = categoryRank(b === "Uncategorized" ? "\0" : b);
      if (ra !== rb) return ra - rb;
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      return a.localeCompare(b);
    })
    .map(([category, items]) => ({ category, items }));
}

function ServicesPanel() {
  const { businessId } = useBusinessId();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Category sections (Ceramic Coatings, Maintenance, Paint Correction, ...)
  // start closed - this is a long list once a business has real services,
  // and opening one at a time to work on it beats scrolling past every
  // other category to get there.
  const [openCategories, setOpenCategories] = useState({});
  function toggleCategory(cat) {
    setOpenCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

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

  // "Move up/down" reorders within a service's own category group, not the
  // whole flat list — jumping a card into a different category on a plain
  // up/down tap would be surprising. Every move still renumbers sort_order
  // across the *entire* list afterward (categories flattened back in
  // CATEGORY_ORDER), so the plain sort_order the rest of the app already
  // queries by (QuickQuote's service picker, Invoices, etc.) stays a valid
  // ordering too — it just now happens to read as "grouped by category."
  async function moveService(id, direction) {
    const groups = groupServices(services);
    for (const g of groups) {
      const idx = g.items.findIndex((s) => s.id === id);
      if (idx === -1) continue;
      const otherIdx = idx + direction;
      if (otherIdx < 0 || otherIdx >= g.items.length) return;
      [g.items[idx], g.items[otherIdx]] = [g.items[otherIdx], g.items[idx]];
      break;
    }
    const withSort = groups.flatMap((g) => g.items).map((s, i) => ({ ...s, sort_order: i }));
    setServices(withSort);
    const { error: updateError } = await supabase.from("services").upsert(withSort.map((s) => ({ id: s.id, sort_order: s.sort_order })));
    if (updateError) setError(updateError.message);
  }

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
      description: service.description,
      duration_hours: service.duration_hours,
    }).eq("id", service.id);
    if (updateError) setError(updateError.message);
  }
  async function deleteService(id) {
    setServices((list) => list.filter((s) => s.id !== id));
    const { error: deleteError } = await supabase.from("services").delete().eq("id", id);
    if (deleteError) setError(deleteError.message);
  }
  async function duplicateService(service) {
    const nextSort = services.length ? Math.max(...services.map((s) => s.sort_order || 0)) + 1 : 1;
    const { data, error: insertError } = await supabase
      .from("services")
      .insert({
        business_id: businessId,
        name: `${service.name} (copy)`,
        category: service.category,
        price_car_low: service.price_car_low,
        price_car_high: service.price_car_high,
        price_suv_low: service.price_suv_low,
        price_suv_high: service.price_suv_high,
        deposit_required: service.deposit_required,
        includes: service.includes,
        description: service.description,
        duration_hours: service.duration_hours,
        sort_order: nextSort,
      })
      .select()
      .single();
    if (insertError) { setError(insertError.message); return; }
    setServices((list) => [...list, data]);
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
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {groupServices(services).map((group) => {
            const open = !!openCategories[group.category];
            return (
              <div key={group.category}>
                <button
                  onClick={() => toggleCategory(group.category)}
                  style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "transparent", border: "none", padding: 0, marginBottom: open ? 10 : 0, cursor: "pointer", textAlign: "left" }}
                >
                  <ChevronDown size={14} color={P.textMuted} style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s ease", flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted }}>
                    {group.category} <span style={{ color: P.border, fontWeight: 600 }}>({group.items.length})</span>
                  </span>
                </button>
                {open && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {group.items.map((s, i) => (
                      <ServiceCard
                        key={s.id}
                        service={s}
                        onUpdateLocal={(next) => updateLocal(s.id, next)}
                        onPersist={persist}
                        onDelete={() => deleteService(s.id)}
                        onDuplicate={() => duplicateService(s)}
                        onMoveUp={() => moveService(s.id, -1)}
                        onMoveDown={() => moveService(s.id, 1)}
                        canMoveUp={i > 0}
                        canMoveDown={i < group.items.length - 1}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: businessLogoUrl ? `url(${businessLogoUrl}) center/cover` : P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: P.accent, flexShrink: 0 }}>{!businessLogoUrl && initials(businessName || "My Business")}</div>
                <div><div style={{ fontSize: 14, fontWeight: 700, color: P.textPrimary }}>{businessName || "My Business"}</div><div style={{ fontSize: 10.5, color: P.textMuted }}>{businessTagline || "Add a tagline in Business Profile"}</div></div>
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

function IntegrationRow({ item, status }) {
  const live = status === "on";
  const soon = status === "soon";
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
      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: live ? P.accent : P.textMuted, flexShrink: 0 }}>
        {live && <CheckIcon size={12} color={P.accent} />} {live ? "On" : soon ? "Coming later" : "Not set up"}
      </span>
    </div>
  );
}

function IntegrationsPanel() {
  const { businessId } = useBusinessId();
  const [flags, setFlags] = useState({ texting: false, payments: false });

  useEffect(() => {
    if (!businessId) return;
    supabase.from("businesses").select("*").eq("id", businessId).single().then(({ data }) => {
      if (data) setFlags({ texting: !!data.texting_enabled, payments: !!data.online_payments_enabled });
    });
  }, [businessId]);

  const rows = [
    { item: { name: "Text messages", desc: "Booking confirmations, reminders, and review requests.", category: "Messaging" }, status: flags.texting ? "on" : "off" },
    { item: { name: "Card payments", desc: "Customers pay invoices online through Stripe.", category: "Payments" }, status: flags.payments ? "on" : "off" },
    { item: { name: "Google Calendar", desc: "Two-way sync with your Schedule.", category: "Calendar" }, status: "soon" },
    { item: { name: "QuickBooks", desc: "Sync invoices and expenses for bookkeeping.", category: "Accounting" }, status: "soon" },
  ];

  return (
    <Panel title="Integrations" sub="What is switched on for your account right now.">
      <Card>
        {rows.map((r, i) => (
          <div key={r.item.name} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${P.border}` : "none" }}>
            <IntegrationRow item={r.item} status={r.status} />
          </div>
        ))}
      </Card>
      <p style={{ fontSize: 11.5, color: P.textMuted, marginTop: 14 }}>
        Texting and card payments are turned on for each account by Atlas. Message us if you want them enabled for yours.
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
      <div style={{ marginBottom: 14 }}><PhoneNotificationsCard businessId={businessId} /></div>
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

/* ---------------------------------- Automations ---------------------------------- */

const AUTOMATION_ROWS = [
  { key: "jobScheduled", label: "Booking confirmation text", sub: "Texts the customer the day and time as soon as a job is Scheduled (or you tap Confirm job)." },
  { key: "dayBefore", label: "Day-before reminder", sub: "Texts the customer about 24 hours before the job, between 8am and 8pm." },
  { key: "review", label: "Review request", sub: "Texts your review link a couple of hours after a job is marked Completed." },
];

function AutomationsPanel() {
  const { businessId } = useBusinessId();
  const [prefs, setPrefs] = useState({ jobScheduled: false, dayBefore: false, review: false, reviewLink: "" });
  const [textingOn, setTextingOn] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    supabase.from("businesses").select("ui_prefs, texting_enabled").eq("id", businessId).single().then(({ data }) => {
      if (!data) return;
      setTextingOn(!!data.texting_enabled);
      if (data.ui_prefs?.automations) setPrefs((p) => ({ ...p, ...data.ui_prefs.automations }));
    });
  }, [businessId]);

  async function save(next) {
    setPrefs(next);
    setSaved(false);
    if (!businessId) return;
    try {
      const { data, error: fetchError } = await supabase.from("businesses").select("ui_prefs").eq("id", businessId).single();
      if (fetchError) throw fetchError;
      const { error: updateError } = await supabase.from("businesses").update({ ui_prefs: { ...(data?.ui_prefs || {}), automations: next } }).eq("id", businessId);
      if (updateError) throw updateError;
      setError("");
      setSaved(true);
    } catch (err) { setError(err.message); }
  }

  const reviewLinkMissing = prefs.review && !prefs.reviewLink.trim();

  return (
    <Panel title="Automations" sub="Texts Atlas sends your customers for you. Each one is off until you turn it on.">
      {error && <p style={{ fontSize: 12.5, color: P.danger, margin: "0 0 12px" }}>{error}</p>}
      {textingOn === false && (
        <p style={{ fontSize: 12.5, color: "#F5A623", margin: "0 0 12px", lineHeight: 1.5 }}>Texting isn't connected for your account yet, so these won't send. Turning them on now saves your choice for when it is.</p>
      )}
      <Card>
        {AUTOMATION_ROWS.map((row, i) => (
          <div key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 16px", borderBottom: i < AUTOMATION_ROWS.length - 1 ? `1px solid ${P.border}` : "none" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: P.textPrimary }}>{row.label}</div>
              <div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>{row.sub}</div>
            </div>
            <Toggle on={!!prefs[row.key]} onClick={() => save({ ...prefs, [row.key]: !prefs[row.key] })} />
          </div>
        ))}
      </Card>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, marginBottom: 8 }}>Google review link</div>
        <input
          value={prefs.reviewLink}
          onChange={(e) => setPrefs({ ...prefs, reviewLink: e.target.value })}
          onBlur={() => save({ ...prefs, reviewLink: prefs.reviewLink.trim() })}
          placeholder="https://g.page/r/your-link/review"
          style={inputStyle}
        />
        {reviewLinkMissing && <p style={{ fontSize: 12, color: "#F5A623", margin: "6px 0 0" }}>Add your review link or the review text won't send.</p>}
      </div>
      <p style={{ fontSize: 11.5, color: P.textMuted, margin: "14px 0 0", lineHeight: 1.5 }}>
        Every text ends with "Reply STOP to opt out." You can also send any of these by hand from a job. {saved ? "Saved." : ""}
      </p>
    </Panel>
  );
}

/* ---------------------------------- Customize ---------------------------------- */

function CustomizePanel() {
  const { businessId, businessUiPrefs } = useBusinessId();
  const [dash, setDash] = useState({ profitBanner: true, insights: true, aiFab: true });
  const [sched, setSched] = useState({ stats: true, ai: true, holidays: true, confirmFirst: true });
  const [cust, setCust] = useState({ aiScript: true });
  const [error, setError] = useState("");

  useEffect(() => {
    if (businessUiPrefs?.dashboard) setDash((d) => ({ ...d, ...businessUiPrefs.dashboard }));
    if (businessUiPrefs?.schedule) setSched((s) => ({ ...s, ...businessUiPrefs.schedule }));
    if (businessUiPrefs?.customers) setCust((c) => ({ ...c, ...businessUiPrefs.customers }));
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
  const toggleCust = (k) => togglePageKey("customers", setCust, cust, k);

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
          { key: "holidays", label: "US holidays on calendar", sub: "Federal holidays marked on the month and day views" },
          { key: "confirmFirst", label: "Confirm approved bookings first", sub: "Jobs from an approved quote save as Pending until you tap Confirm. Turn off to book them straight in." },
        ].map((row, i, arr) => (
          <div key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${P.border}` : "none" }}>
            <div><div style={{ fontSize: 13, fontWeight: 600, color: P.textPrimary }}>{row.label}</div><div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>{row.sub}</div></div>
            <Toggle on={sched[row.key]} onClick={() => toggleSched(row.key)} />
          </div>
        ))}
      </Card>

      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, marginBottom: 8, marginTop: 18 }}>Customers</div>
      <Card>
        {[
          { key: "aiScript", label: "Suggested welcome/follow-up text", sub: "AI-drafted text on a customer's profile, ready to copy or send" },
        ].map((row, i, arr) => (
          <div key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${P.border}` : "none" }}>
            <div><div style={{ fontSize: 13, fontWeight: 600, color: P.textPrimary }}>{row.label}</div><div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>{row.sub}</div></div>
            <Toggle on={cust[row.key]} onClick={() => toggleCust(row.key)} />
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

/* ---------------------------------- Instant Quote ---------------------------------- */

const IQ_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const IQ_THEMES = [["forest", "Forest"], ["midnight", "Midnight"], ["charcoal", "Charcoal"], ["bone", "Light"]];

function iqDefaultConfig(business, services) {
  const num = (v) => (v == null || v === "" ? null : Number(v));
  return {
    trade: "detailing",
    brand: {
      name: business.name || "", kick: "Free Estimate", tagline: business.tagline || "", phone: business.phone || "", email: business.email || "",
      logo: business.logo_url || "", accent: "#18D97A", theme: "forest", pattern: "on", replyWindow: "within 1 business hour",
      instagram: business.social_links?.instagram || "", facebook: business.social_links?.facebook || "", tiktok: business.social_links?.tiktok || "", google: business.social_links?.google || "",
    },
    copy: {
      headline: "Get Your Quote",
      sub: "Tell us about your vehicle. You'll see your price range right away, then send it over and we'll confirm the exact number.",
      step1: "Pick your work", step2: "How do we reach you?",
      disclaimerTitle: "This is an estimate, not a final price.",
      disclaimer: "confirms the exact number once they see it. Nothing is booked and no card is needed.",
    },
    sizes: [{ id: "car", label: "Car / Sedan", hint: "Coupe, sedan, hatch" }, { id: "suv", label: "SUV / Truck / Van", hint: "3-row, pickup, van" }],
    conditionQ: "How dirty is it right now?",
    conditions: [
      { id: "light", label: "Light", hint: "Easy job", lo: 0, hi: 0.25 },
      { id: "moderate", label: "Moderate", hint: "About average", lo: 0.25, hi: 0.65 },
      { id: "heavy", label: "Heavy", hint: "Needs real work", lo: 0.65, hi: 1 },
    ],
    frequencyQ: "How often does it get detailed?",
    frequencies: [
      { id: "monthly", label: "About monthly", uplift: 0 }, { id: "few", label: "Every few months", uplift: 0 },
      { id: "twice", label: "Twice a year", uplift: 5 }, { id: "rare", label: "Once a year or less", uplift: 10 },
    ],
    fields: [
      { k: "year", label: "Year", ph: "2021", max: 4, half: true, numeric: true },
      { k: "make", label: "Make", ph: "Toyota", half: true },
      { k: "model", label: "Model", ph: "4Runner" },
    ],
    services: (services || []).filter((s) => s.name && s.price_car_low != null).map((s) => ({
      name: s.name, cat: s.category || "", desc: s.description || "",
      car: [num(s.price_car_low), num(s.price_car_high)],
      suv: [num(s.price_suv_low ?? s.price_car_low), num(s.price_suv_high)],
    })),
    addons: [],
  };
}

function IqPrice({ value, onChange, placeholder }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 8, padding: "6px 8px", minWidth: 0 }}>
      <span style={{ fontSize: 12, color: P.textMuted }}>$</span>
      <input type="number" min="0" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} placeholder={placeholder} style={{ width: "100%", minWidth: 0, background: "transparent", border: "none", outline: "none", color: P.textPrimary, fontSize: 12.5 }} />
    </div>
  );
}

function PhoneNotificationsCard({ businessId }) {
  const support = pushSupport();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { currentSubscription().then((s) => setOn(!!s)).catch(() => {}); }, []);
  async function flip() {
    setBusy(true); setMsg("");
    try {
      if (on) { await disablePush(); setOn(false); }
      else { await enablePush(businessId); setOn(true); setMsg("On. New requests will now pop up on this phone."); }
    } catch (e) { setMsg(e.message || "Couldn't turn notifications on."); }
    setBusy(false);
  }
  return (
    <Card style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>Notifications on this phone</div>
          <div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2, lineHeight: 1.45 }}>A banner with sound and vibration the moment a request comes in, plus a red number on the Atlas icon for leads you haven't opened.</div>
        </div>
        {support === "ok" && <Toggle on={on} onClick={busy ? () => {} : flip} />}
      </div>
      {support === "needs-install" && <p style={{ fontSize: 12, color: P.secondary, margin: "10px 0 0", lineHeight: 1.5 }}>On iPhone, first tap the Share button in Safari or Chrome, choose "Add to Home Screen", then open Atlas from the new icon and come back here.</p>}
      {support === "unsupported" && <p style={{ fontSize: 12, color: P.textMuted, margin: "10px 0 0" }}>This browser can't show notifications. Try Safari or Chrome on your phone.</p>}
      {msg && <p style={{ fontSize: 12, color: P.textSecondary, margin: "10px 0 0" }}>{msg}</p>}
    </Card>
  );
}

function InstantQuotePanel() {
  const { businessId } = useBusinessId();
  const [loading, setLoading] = useState(true);
  const [biz, setBiz] = useState(null);
  const [slug, setSlug] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const logoRef = useRef(null);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase.from("businesses").select("name, tagline, phone, email, logo_url, social_links, estimate_slug, estimate_enabled, estimate_config").eq("id", businessId).single();
      if (cancelled) return;
      if (e) setError(e.message);
      else {
        setBiz(data);
        setSlug(data.estimate_slug || "");
        setEnabled(!!data.estimate_enabled);
        setCfg(data.estimate_config?.services ? data.estimate_config : null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  function touch(next) { setCfg(next); setDirty(true); setSaved(false); }
  function setBrand(k, v) { touch({ ...cfg, brand: { ...cfg.brand, [k]: v } }); }
  function setCopy(k, v) { touch({ ...cfg, copy: { ...cfg.copy, [k]: v } }); }
  function setService(i, patch) { touch({ ...cfg, services: cfg.services.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }); }
  function setBand(i, size, pos, v) {
    const band = [...(cfg.services[i][size] || [null, null])];
    band[pos] = v;
    setService(i, { [size]: band });
  }
  function setAddon(i, patch) { touch({ ...cfg, addons: cfg.addons.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }); }

  async function startSetup() {
    setError("");
    const { data } = await supabase.from("services").select("name, category, description, price_car_low, price_car_high, price_suv_low, price_suv_high").eq("business_id", businessId).order("sort_order", { ascending: true });
    const next = iqDefaultConfig(biz, data || []);
    if (!slug) setSlug((biz.name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    touch(next);
  }

  async function onLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setBrand("logo", await resizeImageToDataUrl(file, 256)); } catch (err) { setError(err.message || "Couldn't read that image."); }
  }

  async function save() {
    setError("");
    const clean = slug.trim().toLowerCase();
    if (!IQ_SLUG_RE.test(clean)) { setError("Web address can only use letters, numbers and dashes (for example: my-detailing)."); return; }
    const names = cfg.services.map((s) => (s.name || "").trim().toLowerCase());
    if (names.some((n) => !n)) { setError("Every service needs a name."); return; }
    if (new Set(names).size !== names.length) { setError("Two services have the same name. Make each one different."); return; }
    if (cfg.services.some((s) => s.car?.[0] == null)) { setError("Every service needs at least a starting price for a car."); return; }
    if (enabled && !cfg.services.length) { setError("Add at least one service before turning the page on."); return; }
    if (cfg.alerts?.sms) {
      const digits = String(cfg.alerts.phone || "").replace(/\D/g, "");
      if (!(digits.length === 10 || (digits.length === 11 && digits.startsWith("1")))) { setError("Enter a 10-digit US mobile number for text alerts, or turn them off."); return; }
    }
    const fixed = {
      ...cfg,
      services: cfg.services.map((s) => ({
        name: s.name.trim(), cat: (s.cat || "").trim(), desc: s.desc || "",
        car: [Number(s.car[0]), s.car[1] == null ? null : Number(s.car[1])],
        suv: [s.suv?.[0] == null ? Number(s.car[0]) : Number(s.suv[0]), s.suv?.[1] == null ? null : Number(s.suv[1])],
      })),
      addons: cfg.addons.filter((a) => (a.name || "").trim()).map((a) => ({ name: a.name.trim(), price: Number(a.price) || 0, desc: (a.desc || "").trim() })),
    };
    setSaving(true);
    const { error: e } = await supabase.from("businesses").update({ estimate_slug: clean, estimate_enabled: enabled, estimate_config: fixed }).eq("id", businessId).select().single();
    setSaving(false);
    if (e) { setError(e.code === "23505" ? "That web address is already taken. Try another." : e.message); return; }
    setSlug(clean);
    setCfg(fixed);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const link = slug ? `${window.location.origin}/e/${slug}` : "";
  const embed = link ? `<div class="atlas-quote-embed" style="max-width:600px;margin:0 auto;">\n  <iframe src="${link}" title="Get your quote" loading="lazy" scrolling="no" style="width:100%;height:820px;border:0;display:block;border-radius:18px;overflow:hidden;"></iframe>\n</div>\n<script>\n(function () {\n  var wrap = document.currentScript.previousElementSibling;\n  var frame = wrap && wrap.querySelector("iframe");\n  if (!frame) return;\n  window.addEventListener("message", function (e) {\n    var d = e.data;\n    if (!d || d.atlasEstimate !== "height") return;\n    if (frame.contentWindow && e.source !== frame.contentWindow) return;\n    var h = Number(d.height);\n    if (h > 0) frame.style.height = Math.max(520, Math.ceil(h)) + "px";\n  });\n})();\n</script>` : "";
  function copy(what, text) {
    navigator.clipboard?.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(""), 1600);
  }

  const smallBtn = { display: "flex", alignItems: "center", gap: 5, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 9, padding: "8px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
  const ghostBtn = { display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px dashed ${P.border}`, color: P.textMuted, borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", alignSelf: "flex-start" };

  if (loading) return <Panel title="Instant Quote" sub="Loading…"><span /></Panel>;

  if (!cfg) {
    return (
      <Panel title="Instant Quote" sub="A page on your website where customers pick their work, see a price range right away, and send you the request. Every request lands in Customers and Follow-ups.">
        {error && <p style={{ fontSize: 12.5, color: P.danger, margin: "0 0 12px" }}>{error}</p>}
        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: P.textPrimary, marginBottom: 6 }}>Set it up in one tap</div>
          <p style={{ fontSize: 12.5, color: P.textSecondary, margin: "0 0 14px", lineHeight: 1.5 }}>We'll start from the services and prices already in your Settings, plus your logo, phone and name. You can change everything after.</p>
          <button onClick={startSetup} style={smallBtn}>Start from my services</button>
        </Card>
      </Panel>
    );
  }

  return (
    <Panel title="Instant Quote" sub="A page on your website where customers pick their work, see a price range right away, and send you the request. Every request lands in Customers and Follow-ups.">
      {error && <p style={{ fontSize: 12.5, color: P.danger, margin: "0 0 12px" }}>{error}</p>}

      <Card style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>Page is {enabled ? "on" : "off"}</div>
          <div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2 }}>{enabled ? "Customers can use your link." : "Your link shows 'not found' until you turn this on."}</div>
        </div>
        <Toggle on={enabled} onClick={() => { setEnabled((v) => !v); setDirty(true); setSaved(false); }} />
      </Card>

      <Card style={{ padding: 16, marginBottom: 16 }}>
        <Field label="Web address">
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 9, padding: "9px 12px" }}>
            <span style={{ fontSize: 12.5, color: P.textMuted, whiteSpace: "nowrap" }}>{window.location.host}/e/</span>
            <input value={slug} onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setDirty(true); setSaved(false); }} style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: P.textPrimary, fontSize: 13 }} />
          </div>
        </Field>
        {link && !dirty && enabled && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => copy("link", link)} style={smallBtn}>{copied === "link" ? <CheckIcon size={13} /> : <Copy size={13} />} Copy link</button>
            <a href={link} target="_blank" rel="noreferrer" style={{ ...smallBtn, textDecoration: "none" }}><ExternalLink size={13} /> Open page</a>
            <button onClick={() => copy("embed", embed)} style={smallBtn}>{copied === "embed" ? <CheckIcon size={13} /> : <Copy size={13} />} Copy website code</button>
          </div>
        )}
        {(dirty || !enabled) && <p style={{ fontSize: 11.5, color: P.textMuted, margin: "10px 0 0" }}>{dirty ? "Save your changes to get the link and website code." : "Turn the page on and save to get your link."}</p>}
        <p style={{ fontSize: 11.5, color: P.textMuted, margin: "10px 0 0", lineHeight: 1.5 }}>Website code: paste it into an HTML / Embed block on your site (Wix, Squarespace, WordPress, Bluehost, GoDaddy, Shopify). Or just share the link.</p>
      </Card>

      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, margin: "0 0 10px" }}>Services and price ranges</div>
      <p style={{ fontSize: 12, color: P.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>Fill in a low and a high price. Cleaner vehicles quote near the low end, dirtier ones near the high end. Leave the high price blank and customers see "from $X".</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {cfg.services.map((s, i) => (
          <Card key={i} style={{ padding: 14 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input value={s.name} onChange={(e) => setService(i, { name: e.target.value })} placeholder="Service name" style={{ ...inputStyle, fontWeight: 700, flex: 2, minWidth: 0 }} />
              <input value={s.cat || ""} onChange={(e) => setService(i, { cat: e.target.value })} placeholder="Group" style={{ ...inputStyle, flex: 1, minWidth: 0, color: P.textSecondary }} />
              <button onClick={() => touch({ ...cfg, services: cfg.services.filter((_, idx) => idx !== i) })} title="Remove" style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer" }}><Trash2 size={15} /></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
              <div><div style={{ fontSize: 10.5, fontWeight: 600, color: P.textMuted, marginBottom: 4 }}>Car - low</div><IqPrice value={s.car?.[0]} onChange={(v) => setBand(i, "car", 0, v)} /></div>
              <div><div style={{ fontSize: 10.5, fontWeight: 600, color: P.textMuted, marginBottom: 4 }}>Car - high</div><IqPrice value={s.car?.[1]} onChange={(v) => setBand(i, "car", 1, v)} placeholder="from" /></div>
              <div><div style={{ fontSize: 10.5, fontWeight: 600, color: P.textMuted, marginBottom: 4 }}>SUV/Truck - low</div><IqPrice value={s.suv?.[0]} onChange={(v) => setBand(i, "suv", 0, v)} /></div>
              <div><div style={{ fontSize: 10.5, fontWeight: 600, color: P.textMuted, marginBottom: 4 }}>SUV/Truck - high</div><IqPrice value={s.suv?.[1]} onChange={(v) => setBand(i, "suv", 1, v)} placeholder="from" /></div>
            </div>
          </Card>
        ))}
        <button onClick={() => touch({ ...cfg, services: [...cfg.services, { name: "", cat: "", desc: "", car: [null, null], suv: [null, null] }] })} style={ghostBtn}><Plus size={12} /> Add service</button>
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, margin: "24px 0 10px" }}>Add-ons (flat price)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {cfg.addons.map((a, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={a.name} onChange={(e) => setAddon(i, { name: e.target.value })} placeholder="Add-on name" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
              <div style={{ width: 110 }}><IqPrice value={a.price} onChange={(v) => setAddon(i, { price: v })} /></div>
              <button onClick={() => touch({ ...cfg, addons: cfg.addons.filter((_, idx) => idx !== i) })} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer" }}><Trash2 size={15} /></button>
            </div>
            <textarea value={a.desc || ""} onChange={(e) => setAddon(i, { desc: e.target.value })} placeholder="Full description customers see for this add-on" rows={2} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>
        ))}
        <button onClick={() => touch({ ...cfg, addons: [...cfg.addons, { name: "", price: null, desc: "" }] })} style={ghostBtn}><Plus size={12} /> Add add-on</button>
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, margin: "24px 0 10px" }}>Tell me about new requests</div>
      <PhoneNotificationsCard businessId={businessId} />
      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>Send a text when a request comes in</div>
            <div style={{ fontSize: 11.5, color: P.textMuted, marginTop: 2, lineHeight: 1.45 }}>Fast replies win jobs. You'll also see every request in Customers and Follow-ups.</div>
          </div>
          <Toggle on={!!cfg.alerts?.sms} onClick={() => touch({ ...cfg, alerts: { ...cfg.alerts, sms: !cfg.alerts?.sms, phone: cfg.alerts?.phone || biz?.phone || "" } })} />
        </div>
        {cfg.alerts?.sms && (
          <div style={{ marginTop: 12 }}>
            <Field label="Your mobile number"><input type="tel" inputMode="tel" value={cfg.alerts.phone || ""} onChange={(e) => touch({ ...cfg, alerts: { ...cfg.alerts, phone: e.target.value } })} placeholder="(555) 555-5555" style={inputStyle} /></Field>
            <p style={{ fontSize: 11.5, color: P.textMuted, margin: "8px 0 0", lineHeight: 1.5 }}>US numbers only. Message and data rates may apply. Never shown to customers.</p>
          </div>
        )}
      </Card>

      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, margin: "24px 0 10px" }}>Look and wording</div>
      <Card style={{ padding: 16 }}>
        <div className="settings-profile-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Business name"><input value={cfg.brand.name || ""} onChange={(e) => setBrand("name", e.target.value)} style={inputStyle} /></Field>
          <Field label="Tagline"><input value={cfg.brand.tagline || ""} onChange={(e) => setBrand("tagline", e.target.value)} style={inputStyle} /></Field>
          <Field label="Phone shown on the page"><input value={cfg.brand.phone || ""} onChange={(e) => setBrand("phone", e.target.value)} style={inputStyle} /></Field>
          <Field label="Email shown on the page"><input value={cfg.brand.email || ""} onChange={(e) => setBrand("email", e.target.value)} style={inputStyle} /></Field>
          <Field label="How fast you reply"><input value={cfg.brand.replyWindow || ""} onChange={(e) => setBrand("replyWindow", e.target.value)} placeholder="within 1 business hour" style={inputStyle} /></Field>
          <Field label="Page headline"><input value={cfg.copy.headline || ""} onChange={(e) => setCopy("headline", e.target.value)} style={inputStyle} /></Field>
          <Field label="Background">
            <select value={cfg.brand.theme || "forest"} onChange={(e) => setBrand("theme", e.target.value)} style={inputStyle}>
              {IQ_THEMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Accent colour">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={cfg.brand.accent || "#18D97A"} onChange={(e) => setBrand("accent", e.target.value)} style={{ width: 44, height: 36, border: `1px solid ${P.border}`, borderRadius: 8, background: P.surface, padding: 2, cursor: "pointer" }} />
              <span style={{ fontSize: 12.5, color: P.textSecondary }}>{cfg.brand.accent}</span>
            </div>
          </Field>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, border: `1px solid ${P.border}`, background: cfg.brand.logo ? `url(${cfg.brand.logo}) center/cover` : P.accentSoft, flexShrink: 0 }} />
          <button onClick={() => logoRef.current?.click()} style={smallBtn}><ImageIcon size={13} /> Change logo</button>
          {biz?.logo_url && cfg.brand.logo !== biz.logo_url && <button onClick={() => setBrand("logo", biz.logo_url)} style={{ ...ghostBtn, alignSelf: "center" }}>Use my business logo</button>}
          <input ref={logoRef} type="file" accept="image/*" onChange={onLogo} style={{ display: "none" }} />
        </div>
      </Card>

      <div style={{ position: "sticky", bottom: 78, marginTop: 20, display: "flex", alignItems: "center", gap: 12, background: P.bgTop, border: `1px solid ${P.border}`, borderRadius: 12, padding: "10px 14px" }}>
        <button onClick={save} disabled={saving || !dirty} style={{ ...smallBtn, opacity: saving || !dirty ? 0.5 : 1 }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckIcon size={13} /> : null} {saved ? "Saved" : "Save changes"}
        </button>
        <span style={{ fontSize: 12, color: dirty ? P.secondary : P.textMuted }}>{dirty ? "You have unsaved changes." : "Everything is saved."}</span>
      </div>
    </Panel>
  );
}

const PANELS = {
  profile: ProfilePanel, services: ServicesPanel, instantquote: InstantQuotePanel, booking: BookingPanel, page: PublicPagePanel,
  integrations: IntegrationsPanel, taxes: TaxesPanel,
  employees: EmployeesPanel, hours: HoursPanel, notifications: NotificationsPanel, automations: AutomationsPanel, customize: CustomizePanel,
  account: AccountPanel,
};

/* ---------------------------------- page ---------------------------------- */

export default function AtlasSettings({ onNavigate, currentPage = "settings", onSignOut, navParams }) {
  const { businessId, businessName, businessLogoUrl } = useBusinessId();
  const now = useLiveClock();
  const [section, setSection] = useState(() => (navParams?.section && PANELS[navParams.section] ? navParams.section : "profile"));
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
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: businessLogoUrl ? `url(${businessLogoUrl}) center/cover` : P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: P.accent }}>{!businessLogoUrl && initials(businessName || "My Business")}</div>
            <div><div style={{ fontSize: 12.5, fontWeight: 600, color: P.textPrimary }}>{businessName || "My Business"}</div><div style={{ fontSize: 11, color: P.textMuted }}>Owner</div></div>
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
          <span className="flex lg:hidden" style={{ fontSize: 11, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>Settings</span>
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
