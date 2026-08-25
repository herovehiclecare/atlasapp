import { useState, useRef, useEffect } from "react";
import {
  LayoutGrid, Calendar, Users, Car, Receipt, Settings, Sparkles,
  MoreHorizontal, Pencil, Camera, Plus, Search, Download,
  CreditCard, X, Loader2, Image as ImageIcon, FileText, ListChecks,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { useBusinessId } from "./useBusinessId";
import { formatDate, downloadCsv, shortId, uploadImages, parseDate, printWhenReady, findService, svcPrice, resizeImageToDataUrl, useLiveClock, formatDateTime } from "./lib";

const PHOTOS_BUCKET = "invoice-photos";

const P = {
  bg: "#06100C", bgTop: "#0B1813", surface: "#0F1B15", surfaceHover: "#132018",
  border: "#1E2E25", textPrimary: "#EDF6F1", textSecondary: "#92AA9D", textMuted: "#566B5E",
  accent: "#18D97A", accentHover: "#35E890", secondary: "#FF7A63",
  accentSoft: "rgba(24,217,122,0.14)", secondarySoft: "rgba(255,122,99,0.14)", danger: "#FF6B5E",
};
const HUES = ["#18D97A", "#4C8DFF", "#9B6BFF", "#F5A623", "#FF7A63", "#4FD1C5"];
const STATUS_COLOR = { paid: P.accent, unpaid: "#4C8DFF", overdue: P.danger };
const STATUS_LABEL = { paid: "Paid", unpaid: "Unpaid", overdue: "Overdue" };
const FILTERS = ["All", "Unpaid", "Overdue", "Paid"];

const inputStyle = {
  width: "100%", background: "transparent", border: `1px solid ${P.border}`,
  borderRadius: 10, padding: "10px 12px", fontSize: 13.5, color: P.textPrimary, outline: "none", boxSizing: "border-box",
};
const labelStyle = { display: "block", fontSize: 12.5, fontWeight: 500, color: P.textSecondary, marginBottom: 6 };

function AtlasMark({ size = 24 }) {
  const gid = "atlas-globe-invoices";
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
  { id: "settings", label: "Settings", Icon: Settings },
];
const MOBILE_NAV = [
  { id: "dashboard", label: "Home", Icon: LayoutGrid }, { id: "schedule", label: "Schedule", Icon: Calendar },
  { id: "customers", label: "Clients", Icon: Users }, { id: "invoices", label: "Invoices", Icon: Receipt },
  { id: "more", label: "More", Icon: MoreHorizontal },
];
// Pages that don't fit in the 5-slot mobile bottom bar — "More" opens a sheet listing these.
const MORE_PAGES = [
  { id: "vehicles", label: "Vehicles", Icon: Car }, { id: "quote", label: "Atlas QuickQuote", Icon: Sparkles },
  { id: "followups", label: "Follow-ups", Icon: ListChecks }, { id: "settings", label: "Settings", Icon: Settings },
];

function hue(i) { return HUES[i % HUES.length]; }
function initials(name) { return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(); }
function money(n) { return `$${(Number(n) || 0).toLocaleString()}`; }
function daysBetween(a, b) { return Math.round((a - b) / (1000 * 60 * 60 * 24)); }

// `amount` always means the final total owed (unchanged everywhere else in
// this file); subtotal/tax are derived from it and the stored tax_rate
// rather than a separate stored subtotal, so they can never drift apart.
function invoiceBreakdown(amount, taxRate) {
  const total = Number(amount) || 0;
  const rate = Number(taxRate) || 0;
  const subtotal = total / (1 + rate / 100);
  return { subtotal, tax: total - subtotal, total };
}

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

function StatCard({ label, value, sub, tone }) {
  return (
    <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone || P.textPrimary, marginTop: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: P.textSecondary, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: STATUS_COLOR[status], background: `${STATUS_COLOR[status]}22`, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[status] }} /> {STATUS_LABEL[status]}
    </span>
  );
}

function InvoiceRow({ inv, i, onMarkPaid, onPreview, onEdit, marking }) {
  const overdueDays = inv.status === "overdue" && inv.due_date ? daysBetween(new Date(), parseDate(inv.due_date)) * -1 : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", flexWrap: "wrap" }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${hue(i)}22`, color: hue(i), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>{initials(inv.customers?.name || "—")}</div>

      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>{inv.customers?.name || "No customer"}</span>
          <span style={{ fontSize: 11, color: P.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>INV-{shortId(inv.id)}</span>
          {inv.quote_id && <span style={{ fontSize: 9.5, fontWeight: 700, color: P.accent, background: P.accentSoft, borderRadius: 20, padding: "1px 7px" }}>from quote</span>}
        </div>
        {inv.status === "paid" && <div style={{ fontSize: 11, color: P.textMuted, marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}><CreditCard size={11} /> Marked paid · {formatDate(inv.created_at)}</div>}
        {inv.status === "overdue" && <div style={{ fontSize: 11, color: P.danger, marginTop: 3 }}>{overdueDays > 0 ? `${overdueDays} days overdue · ` : ""}was due {formatDate(inv.due_date)}</div>}
        {inv.status === "unpaid" && <div style={{ fontSize: 11, color: P.textMuted, marginTop: 3 }}>{inv.due_date ? `Due ${formatDate(inv.due_date)}` : "No due date set"}</div>}
      </div>

      <StatusBadge status={inv.status} />

      <div style={{ fontSize: 15, fontWeight: 700, color: P.textPrimary, width: 74, textAlign: "right", flexShrink: 0 }}>{money(inv.amount)}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <button onClick={() => onEdit(inv)} title="Edit" style={{ background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 8, padding: 6, cursor: "pointer", display: "flex" }}>
          <Pencil size={12} />
        </button>
        <button onClick={() => onPreview(inv)} style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 8, padding: "6px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
          <FileText size={12} /> PDF
        </button>
        {(inv.status === "unpaid" || inv.status === "overdue") && (
          <button onClick={() => onMarkPaid(inv.id)} disabled={marking} style={{ display: "flex", alignItems: "center", gap: 5, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 8, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, cursor: marking ? "default" : "pointer", opacity: marking ? 0.7 : 1 }}>
            {marking ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />} Mark paid
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- Invoice modal (create + edit) ---------------------------------- */

function InvoiceModal({ businessId, customers, quotes, vehicles, services, invoice, taxEnabled, defaultTaxRate, onClose, onSaved }) {
  const isEdit = !!invoice;
  const [customerId, setCustomerId] = useState(invoice?.customer_id || "");
  const [quoteId, setQuoteId] = useState(invoice?.quote_id || "");
  const [vehicleId, setVehicleId] = useState(invoice?.vehicle_id || "");
  const [serviceIds, setServiceIds] = useState(invoice?.service_ids || []);
  const [taxRate, setTaxRate] = useState(invoice?.tax_rate != null ? String(invoice.tax_rate) : String(taxEnabled ? defaultTaxRate : 0));
  const [amount, setAmount] = useState(invoice ? String(invoice.amount) : "");
  const [dueDate, setDueDate] = useState(invoice?.due_date || "");
  const [status, setStatus] = useState(invoice?.status || "unpaid");
  const [notes, setNotes] = useState(invoice?.notes || "");
  const [existingPhotos, setExistingPhotos] = useState(invoice?.photos || []);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const quotesForCustomer = customerId ? quotes.filter((q) => q.customer_id === customerId) : [];
  const vehiclesForCustomer = customerId ? vehicles.filter((v) => v.customer_id === customerId) : vehicles;
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const categories = [...new Set(services.map((s) => s.category))];
  const itemized = serviceIds.length > 0;
  const computedSubtotal = serviceIds.reduce((s, id) => s + svcPrice(findService(services, id), selectedVehicle), 0);
  const computedTax = computedSubtotal * ((Number(taxRate) || 0) / 100);
  const computedTotal = computedSubtotal + computedTax;

  // When services are picked, the amount is derived from them so the total
  // can never drift out of sync with the itemized lines shown on the PDF.
  useEffect(() => {
    if (itemized) setAmount(String(Math.round(computedTotal * 100) / 100));
  }, [itemized, computedTotal]);

  function toggleService(id) {
    setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function pickQuote(id) {
    setQuoteId(id);
    const q = quotes.find((x) => x.id === id);
    if (q?.totals && serviceIds.length === 0) {
      const t = q.totals.isRange ? q.totals.rangeHigh : q.totals.total;
      if (t != null) setAmount(String(Math.round(t * 100) / 100));
    }
  }

  function onPickPhotos(e) {
    const files = Array.from(e.target.files || []);
    setPhotoFiles((f) => [...f, ...files]);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreviews((p) => [...p, reader.result]);
      reader.readAsDataURL(file);
    });
  }
  function removeNewPhoto(i) {
    setPhotoFiles((f) => f.filter((_, idx) => idx !== i));
    setPhotoPreviews((p) => p.filter((_, idx) => idx !== i));
  }
  function removeExistingPhoto(i) {
    setExistingPhotos((p) => p.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amount || Number.isNaN(amt) || amt < 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSaving(true);
    setError("");

    let uploadedUrls = [];
    if (photoFiles.length > 0) {
      try {
        uploadedUrls = await uploadImages(supabase, PHOTOS_BUCKET, businessId, photoFiles);
      } catch (uploadError) {
        setSaving(false);
        setError(uploadError.message);
        return;
      }
    }

    const payload = {
      business_id: businessId,
      customer_id: customerId || null,
      quote_id: quoteId || null,
      vehicle_id: vehicleId || null,
      service_ids: serviceIds,
      tax_rate: Number(taxRate) || 0,
      amount: amt,
      status,
      due_date: dueDate || null,
      notes: notes.trim() || null,
      photos: [...existingPhotos, ...uploadedUrls],
    };

    const query = isEdit
      ? supabase.from("invoices").update(payload).eq("id", invoice.id)
      : supabase.from("invoices").insert(payload);
    const { data, error: saveErr } = await query.select("*, customers(name, email, phone), vehicles(label, vehicle_type, color_hex, size_class)").single();

    setSaving(false);
    if (saveErr) {
      setError(saveErr.message);
      return;
    }
    onSaved(data, isEdit);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(440px, calc(100vw - 32px))", maxHeight: "calc(100vh - 40px)", overflowY: "auto", background: P.bg, border: `1px solid ${P.border}`, borderRadius: 16, zIndex: 51, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: P.textPrimary }}>{isEdit ? "Edit invoice" : "New invoice"}</span>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ fontSize: 12.5, color: P.danger }}>{error}</div>}

          <div>
            <label style={labelStyle}>Customer</label>
            <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setQuoteId(""); }} style={inputStyle}>
              <option value="">No customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Vehicle (optional)</label>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} style={inputStyle}>
              <option value="">No vehicle</option>
              {vehiclesForCustomer.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Link to a quote (optional)</label>
            <select value={quoteId} onChange={(e) => pickQuote(e.target.value)} disabled={!customerId} style={inputStyle}>
              <option value="">No linked quote</option>
              {quotesForCustomer.map((q) => (
                <option key={q.id} value={q.id}>
                  #{shortId(q.id)} — {q.totals?.isRange ? `${money(q.totals.rangeLow)}–${money(q.totals.rangeHigh)}` : money(q.totals?.total)} ({q.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Services (optional — itemizes the PDF)</label>
            <div style={{ border: `1px solid ${P.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10, maxHeight: 180, overflowY: "auto" }}>
              {services.length === 0 ? (
                <p style={{ fontSize: 12, color: P.textMuted, margin: 0, fontStyle: "italic" }}>No services set up yet.</p>
              ) : categories.map((cat) => (
                <div key={cat}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: P.textMuted, marginBottom: 6 }}>{cat}</div>
                  {services.filter((s) => s.category === cat).map((s) => (
                    <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}>
                      <input type="checkbox" checked={serviceIds.includes(s.id)} onChange={() => toggleService(s.id)} style={{ accentColor: P.accent }} />
                      <span style={{ fontSize: 12.5, color: P.textSecondary, flex: 1 }}>{s.name}</span>
                      <span style={{ fontSize: 11.5, color: P.textMuted }}>${svcPrice(s, selectedVehicle)}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Tax rate (%)</label>
              {taxEnabled ? (
                <input type="number" min="0" step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} style={inputStyle} />
              ) : (
                <div style={{ background: P.surface, border: `1px dashed ${P.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 11.5, color: P.textMuted }}>
                  Tax is off — enable it in Settings → Taxes.
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Amount ($){itemized && " — from services"}</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" disabled={itemized} style={{ ...inputStyle, opacity: itemized ? 0.7 : 1 }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Due date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Condition / job notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. Heavy pet hair in rear seats, noted before service…" style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>

          <div>
            <label style={labelStyle}>Completed-job photos</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 8 }}>
              <button type="button" onClick={() => fileRef.current?.click()} style={{ aspectRatio: "1", border: `1px dashed ${P.border}`, borderRadius: 10, background: "transparent", color: P.textMuted, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, cursor: "pointer" }}>
                <ImageIcon size={16} /> <span style={{ fontSize: 9.5 }}>Add</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPickPhotos} style={{ display: "none" }} />
              {existingPhotos.map((src, i) => (
                <div key={`existing-${i}`} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: `1px solid ${P.border}` }}>
                  <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button type="button" onClick={() => removeExistingPhoto(i)} style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={10} /></button>
                </div>
              ))}
              {photoPreviews.map((src, i) => (
                <div key={`new-${i}`} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: `1px solid ${P.border}` }}>
                  <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button type="button" onClick={() => removeNewPhoto(i)} style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={10} /></button>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: P.textMuted, margin: "6px 0 0" }}>Attached to this invoice's PDF, so the customer sees the finished job.</p>
          </div>

          <button type="submit" disabled={saving} style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 10, padding: "11px 16px", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.85 : 1 }}>
            {saving ? <><Loader2 size={15} className="animate-spin" /> {isEdit ? "Saving…" : "Uploading & saving…"}</> : isEdit ? "Save changes" : "Create invoice"}
          </button>
        </form>
      </div>
    </>
  );
}

/* ---------------------------------- printable invoice ---------------------------------- */

const PRINT_ACCENT = "#18D97A";

function PrintHeader({ business, docLabel, preparedDate }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {business.logoUrl ? (
            <img src={business.logoUrl} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${PRINT_ACCENT}22`, color: PRINT_ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>
              {initials(business.name || "?")}
            </div>
          )}
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em" }}>{business.name}</div>
            {business.tagline && <div style={{ fontSize: 10.5, color: "#777", marginTop: 2 }}>{business.tagline}</div>}
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: PRINT_ACCENT, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{docLabel}</div>
      </div>
      <div style={{ height: 3, background: PRINT_ACCENT, borderRadius: 2, margin: "14px 0 8px" }} />
      <div style={{ fontSize: 11, color: "#555" }}>Prepared {preparedDate}</div>
    </div>
  );
}

function PrintSection({ label, children, style }) {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 4, height: 13, borderRadius: 2, background: PRINT_ACCENT, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#555" }}>{label}</span>
      </div>
      <div style={{ background: "#f4f4f4", borderRadius: 10, padding: "13px 15px" }}>
        {children}
      </div>
    </div>
  );
}

function PrintableInvoice({ inv, services, business }) {
  if (!inv) return null;
  const { subtotal, tax, total } = invoiceBreakdown(inv.amount, inv.tax_rate);
  const vehicle = inv.vehicles;
  const serviceIds = inv.service_ids || [];
  const lineItems = serviceIds.length > 0
    ? serviceIds.map((id) => {
        const s = findService(services, id);
        return { name: s?.name || "Service", price: svcPrice(s, vehicle), includes: s?.includes || [] };
      })
    : [{ name: "Detailing service", price: subtotal, includes: [] }];
  const paymentTerms = inv.due_date ? `Payment due by ${formatDate(inv.due_date)}` : "Due on receipt";

  return (
    <div id="atlas-print-root">
      <PrintHeader business={business} docLabel={business.invoiceLabel || "INVOICE"} preparedDate={formatDate(inv.created_at)} />

      <PrintSection label="Prepared For">
        <div style={{ fontWeight: 700, fontSize: 13 }}>{inv.customers?.name || "No customer"}</div>
        {vehicle && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#444", marginTop: 3 }}>
            {vehicle.color_hex && <span style={{ width: 9, height: 9, borderRadius: 3, background: vehicle.color_hex, border: "1px solid #ccc", display: "inline-block" }} />}
            {vehicle.label}
          </div>
        )}
        {inv.customers?.phone && <div style={{ fontSize: 12, color: "#444", marginTop: 3 }}>{inv.customers.phone}</div>}
        {inv.customers?.email && <div style={{ fontSize: 12, color: "#444", marginTop: 3 }}>{inv.customers.email}</div>}
        <div style={{ fontSize: 11, color: "#777", marginTop: 6, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>{inv.status}</div>
      </PrintSection>

      {inv.notes && (
        <PrintSection label="Job Details">
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#777", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" }}>Condition</div>
          <div style={{ fontSize: 12, color: "#333", lineHeight: 1.5 }}>{inv.notes}</div>
        </PrintSection>
      )}

      <PrintSection label="What's Included">
        {lineItems.map((item, i) => (
          <div key={i} style={{ marginBottom: i < lineItems.length - 1 ? 10 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span style={{ fontWeight: 600 }}>{item.name}</span><span style={{ fontWeight: 600 }}>${item.price.toFixed(2)}</span>
            </div>
            {item.includes.length > 0 && (
              <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                {item.includes.map((line, j) => (
                  <li key={j} style={{ fontSize: 10.5, color: "#777", lineHeight: 1.5 }}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </PrintSection>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
          <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
        </div>
        {Number(inv.tax_rate) > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span>Tax ({inv.tax_rate}%)</span><span>${tax.toFixed(2)}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, marginTop: 10, paddingTop: 10, borderTop: `2px solid ${PRINT_ACCENT}` }}>
          <span>Total</span><span>${total.toFixed(2)}</span>
        </div>
      </div>

      {inv.photos && inv.photos.length > 0 && (
        <PrintSection label="Completed-Job Photos" style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {inv.photos.map((src, i) => (
              <img key={i} src={src} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 6, border: "1px solid #ccc" }} />
            ))}
          </div>
        </PrintSection>
      )}

      <PrintSection label="Notes">
        <p style={{ margin: "0 0 4px", fontSize: 12 }}>Thank you for your business!</p>
        <p style={{ margin: 0, fontSize: 11.5, color: "#555" }}>{paymentTerms}</p>
      </PrintSection>
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function AtlasInvoices({ onNavigate, currentPage = "invoices" }) {
  const { businessId, businessName, businessLogoUrl, businessTagline, businessInvoiceLabel, businessDefaultTaxRate, businessTaxEnabled, loading: bizLoading, error: bizError } = useBusinessId();
  const now = useLiveClock();
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [services, setServices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [invoicesError, setInvoicesError] = useState("");
  const [markingId, setMarkingId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [printInvoice, setPrintInvoice] = useState(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;

    async function load() {
      setLoadingInvoices(true);
      const [invoicesRes, customersRes, quotesRes, vehiclesRes, servicesRes] = await Promise.all([
        supabase.from("invoices").select("*, customers(name, email, phone), vehicles(label, vehicle_type, color_hex, size_class)").eq("business_id", businessId).order("created_at", { ascending: false }),
        supabase.from("customers").select("id, name").eq("business_id", businessId).order("name", { ascending: true }),
        supabase.from("quotes").select("id, customer_id, status, totals").eq("business_id", businessId).order("created_at", { ascending: false }),
        supabase.from("vehicles").select("id, label, customer_id, color_hex, vehicle_type, size_class").eq("business_id", businessId).order("label", { ascending: true }),
        supabase.from("services").select("id, name, category, price_car_low, price_suv_low, includes").eq("business_id", businessId).order("sort_order", { ascending: true }),
      ]);

      if (cancelled) return;
      if (invoicesRes.error) {
        setInvoicesError(invoicesRes.error.message);
      } else {
        setInvoices(invoicesRes.data);
      }
      setCustomers(customersRes.data || []);
      setQuotes(quotesRes.data || []);
      setVehicles(vehiclesRes.data || []);
      setServices(servicesRes.data || []);
      setLoadingInvoices(false);
    }

    load();
    return () => { cancelled = true; };
  }, [businessId]);

  const loading = bizLoading || (!!businessId && loadingInvoices);
  const error = bizError || invoicesError;

  async function markPaid(id) {
    const previous = invoices;
    setMarkingId(id);
    setInvoices((list) => list.map((inv) => (inv.id === id ? { ...inv, status: "paid" } : inv)));
    const { error: updateError } = await supabase.from("invoices").update({ status: "paid" }).eq("id", id);
    setMarkingId(null);
    if (updateError) setInvoices(previous);
  }

  function handleSaved(inv, wasEdit) {
    setInvoices((list) => (wasEdit ? list.map((x) => (x.id === inv.id ? inv : x)) : [inv, ...list]));
    setAddOpen(false);
    setEditingInvoice(null);
  }

  function handleExport() {
    const rows = [["Invoice", "Customer", "Amount", "Status", "Due Date", "Created"]].concat(
      filtered.map((inv) => [`INV-${shortId(inv.id)}`, inv.customers?.name || "", inv.amount, inv.status, inv.due_date || "", formatDate(inv.created_at)])
    );
    downloadCsv(rows, "invoices.csv");
  }

  useEffect(() => {
    if (!printInvoice) return;
    const handleAfterPrint = () => setPrintInvoice(null);
    window.addEventListener("afterprint", handleAfterPrint);
    const t = setTimeout(() => printWhenReady(), 0);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", handleAfterPrint); };
  }, [printInvoice]);

  const filtered = invoices.filter((inv) => {
    const matchesQuery = `${inv.customers?.name || ""} ${inv.id}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "All" || inv.status === filter.toLowerCase();
    return matchesQuery && matchesFilter;
  });

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const totalOutstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + Number(i.amount), 0);
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;

  return (
    <div style={{ minHeight: "100vh", background: P.bg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap');
        #atlas-print-root { display: none; }
        @media print {
          body * { visibility: hidden; }
          #atlas-print-root, #atlas-print-root * { visibility: visible; }
          #atlas-print-root { display: block; position: absolute; top: 0; left: 0; width: 100%; padding: 40px; background: #fff; color: #111; }
        }
      `}</style>

      {/* SIDEBAR */}
      <div className="hidden lg:flex" style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${P.border}`, flexDirection: "column", padding: "22px 14px", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px", marginBottom: 28 }}>
          <AtlasMark size={24} /><span style={{ fontSize: 16, fontWeight: 700, color: P.textPrimary }}>Atlas</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {NAV.map((item) => <NavItem key={item.id} item={item} active={currentPage === item.id} onClick={() => onNavigate(item.id)} />)}
        </div>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderTop: `1px solid ${P.border}`, paddingTop: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: businessLogoUrl ? `url(${businessLogoUrl}) center/cover` : P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: P.accent }}>{!businessLogoUrl && initials(businessName || "Detail Hero")}</div>
          <div><div style={{ fontSize: 12.5, fontWeight: 600, color: P.textPrimary }}>{businessName || "Detail Hero"}</div><div style={{ fontSize: 11, color: P.textMuted }}>Owner</div></div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 88 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${P.border}`, position: "sticky", top: 0, background: P.bg, zIndex: 10, gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
            <BrandLockup size={30} businessId={businessId} realName={businessName} realLogoUrl={businessLogoUrl} />
            <div className="hidden lg:flex" style={{ alignItems: "center", gap: 14 }}>
              <div style={{ width: 1, height: 20, background: P.border }} />
              <span style={{ fontSize: 13, color: P.textSecondary, whiteSpace: "nowrap" }}>Invoices <span style={{ color: P.textMuted }}>· {invoices.length} total · {formatDateTime(now)}</span></span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button onClick={handleExport} disabled={filtered.length === 0} className="hidden lg:flex" style={{ alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: filtered.length === 0 ? "default" : "pointer", opacity: filtered.length === 0 ? 0.5 : 1 }}><Download size={13} /> Export</button>
            <button onClick={() => setAddOpen(true)} disabled={!businessId} style={{ display: "flex", alignItems: "center", gap: 6, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: businessId ? "pointer" : "default", opacity: businessId ? 1 : 0.6 }}><Plus size={14} /> New Invoice</button>
          </div>
        </div>

        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 18, maxWidth: 900, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
            <StatCard label="Total Invoiced" value={money(totalInvoiced)} sub={`${invoices.length} invoices`} />
            <StatCard label="Paid" value={money(totalPaid)} tone={P.accent} sub={`${invoices.filter((i) => i.status === "paid").length} invoices`} />
            <StatCard label="Outstanding" value={money(totalOutstanding)} tone={P.secondary} sub="unpaid + overdue balance" />
            <StatCard label="Overdue" value={overdueCount} tone={overdueCount > 0 ? P.danger : undefined} sub="need a follow-up" />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 240px", display: "flex", alignItems: "center", gap: 8, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: "9px 12px" }}>
              <Search size={15} color={P.textMuted} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by customer or invoice #…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: P.textPrimary, fontSize: 13.5 }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {FILTERS.map((f) => {
              const count = f === "All" ? invoices.length : invoices.filter((i) => i.status === f.toLowerCase()).length;
              const isActive = filter === f;
              return (
                <button key={f} onClick={() => setFilter(f)} style={{ fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 20, cursor: "pointer", border: `1px solid ${isActive ? P.accent : P.border}`, background: isActive ? P.accentSoft : "transparent", color: isActive ? P.accent : P.textSecondary }}>
                  {f} ({count})
                </button>
              );
            })}
          </div>

          {loading ? (
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "40px 18px", textAlign: "center", fontSize: 13, color: P.textMuted, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Loader2 size={15} className="animate-spin" /> Loading invoices…
            </div>
          ) : error ? (
            <div style={{ background: "rgba(255,107,94,0.1)", border: `1px solid ${P.danger}`, borderRadius: 14, padding: "18px", fontSize: 13, color: P.danger }}>{error}</div>
          ) : filtered.length === 0 ? (
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "40px 18px", textAlign: "center" }}>
              <Receipt size={22} color={P.textMuted} style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: P.textPrimary }}>{invoices.length === 0 ? "No invoices yet" : "No invoices match"}</div>
              <div style={{ fontSize: 12.5, color: P.textMuted, marginTop: 4 }}>{invoices.length === 0 ? "Create your first invoice to get started." : "Try a different filter or search term."}</div>
            </div>
          ) : (
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, overflow: "hidden" }}>
              {filtered.map((inv, i) => (
                <div key={inv.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${P.border}` : "none" }}>
                  <InvoiceRow inv={inv} i={i} onMarkPaid={markPaid} onPreview={setPrintInvoice} onEdit={setEditingInvoice} marking={markingId === inv.id} />
                </div>
              ))}
            </div>
          )}
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

      {(addOpen || editingInvoice) && (
        <InvoiceModal
          businessId={businessId}
          customers={customers}
          quotes={quotes}
          vehicles={vehicles}
          services={services}
          taxEnabled={businessTaxEnabled}
          defaultTaxRate={businessDefaultTaxRate}
          invoice={editingInvoice}
          onClose={() => { setAddOpen(false); setEditingInvoice(null); }}
          onSaved={handleSaved}
        />
      )}
      <PrintableInvoice inv={printInvoice} services={services} business={{ name: businessName || "Your Business", logoUrl: businessLogoUrl, tagline: businessTagline, invoiceLabel: businessInvoiceLabel }} />
    </div>
  );
}
