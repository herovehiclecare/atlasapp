import { useState, useEffect, useRef } from "react";
import {
  LayoutGrid, Calendar, Users, Car, Receipt, Settings, Plus,
  Sparkles, Search, MoreHorizontal, SlidersHorizontal,
  Phone, MessageSquare, ChevronRight, Download, ChevronDown, Pencil, Camera,
  X, Loader2, ListChecks, Navigation, Check, Trash2,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { useBusinessId } from "./useBusinessId";
import { formatDate, downloadCsv, resizeImageToDataUrl, useLiveClock, formatDateTime, directionsUrl } from "./lib";

const P = {
  bg: "#06100C", bgTop: "#0B1813", surface: "#0F1B15", surfaceHover: "#132018",
  border: "#1E2E25", textPrimary: "#EDF6F1", textSecondary: "#92AA9D", textMuted: "#566B5E",
  accent: "#18D97A", accentHover: "#35E890", secondary: "#FF7A63",
  accentSoft: "rgba(24,217,122,0.14)", secondarySoft: "rgba(255,122,99,0.14)", danger: "#FF6B5E",
};
const HUES = ["#18D97A", "#4C8DFF", "#9B6BFF", "#F5A623", "#FF7A63", "#4FD1C5"];
function money(n) { return `$${(Number(n) || 0).toLocaleString()}`; }

const JOB_STATUS_LABEL = { scheduled: "Scheduled", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
function statusBadgeColor(status) {
  if (status === "completed" || status === "paid") return P.accent;
  if (status === "cancelled") return P.danger;
  if (status === "in_progress") return "#F5A623";
  return P.textSecondary;
}

const inputStyle = {
  width: "100%", background: "transparent", border: `1px solid ${P.border}`,
  borderRadius: 10, padding: "10px 12px", fontSize: 13.5, color: P.textPrimary, outline: "none", boxSizing: "border-box",
};

function AtlasMark({ size = 24 }) {
  const gid = "atlas-globe-customers-v";
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

function initials(name) { return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(); }
function hue(i) { return HUES[((i % HUES.length) + HUES.length) % HUES.length]; }
function colorForId(id) {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return hue(sum);
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

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: P.textPrimary, marginTop: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: P.textSecondary, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function QuickActions({ size = 32, iconSize = 13, phone, onOpen }) {
  const actionStyle = { width: size, height: size, borderRadius: 8, border: `1px solid ${P.border}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      {phone ? (
        <a href={`tel:${phone}`} title={`Call ${phone}`} style={{ ...actionStyle, color: P.textSecondary, textDecoration: "none", cursor: "pointer" }}><Phone size={iconSize} /></a>
      ) : (
        <span title="No phone on file" style={{ ...actionStyle, color: P.textMuted, opacity: 0.4, cursor: "default" }}><Phone size={iconSize} /></span>
      )}
      {phone ? (
        <a href={`sms:${phone}`} title={`Text ${phone}`} style={{ ...actionStyle, color: P.textSecondary, textDecoration: "none", cursor: "pointer" }}><MessageSquare size={iconSize} /></a>
      ) : (
        <span title="No phone on file" style={{ ...actionStyle, color: P.textMuted, opacity: 0.4, cursor: "default" }}><MessageSquare size={iconSize} /></span>
      )}
      <button onClick={onOpen} style={{ ...actionStyle, color: P.textMuted, cursor: "pointer" }}><ChevronRight size={iconSize + 1} /></button>
    </div>
  );
}

/* ---------------------------------- list view ---------------------------------- */

function RowsView({ list, selected, toggleSelect, onOpenDetail }) {
  return (
    <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, overflow: "hidden" }}>
      {list.map((c, i) => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: i < list.length - 1 ? `1px solid ${P.border}` : "none" }}>
          <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} style={{ accentColor: P.accent, flexShrink: 0 }} />
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: `${hue(i)}22`, color: hue(i), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials(c.name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>{c.name}</div>
            <div style={{ fontSize: 12, color: P.textMuted, marginTop: 2 }}>{c.phone || "No phone"}{c.email ? ` · ${c.email}` : ""}</div>
          </div>
          <div className="hidden lg:block" style={{ textAlign: "right", flexShrink: 0, marginRight: 8 }}>
            <div style={{ fontSize: 11, color: P.textMuted }}>Added {formatDate(c.created_at)}</div>
          </div>
          <QuickActions phone={c.phone} onOpen={() => onOpenDetail(c)} />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------- Customer Detail drawer ---------------------------------- */

// A click-to-edit field: shows the value as plain text until clicked, then
// becomes an input that saves on blur/Enter. Used throughout the customer
// detail drawer so every field (not just address) can be corrected without
// a separate "edit customer" modal.
function EditableField({ label, value, onSave, placeholder, type = "text", big }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDraft(value || ""); setEditing(false); }, [value]);

  async function commit() {
    setEditing(false);
    if (draft === (value || "")) return;
    setSaving(true);
    await onSave(draft.trim() || null);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const textStyle = big
    ? { fontSize: 15, fontWeight: 700, color: P.textPrimary }
    : { fontSize: 12.5, color: P.textSecondary };

  if (editing) {
    return (
      <input
        autoFocus type={type} value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", borderBottom: `1px solid ${P.accent}`, outline: "none", padding: 0, fontFamily: "inherit", ...textStyle }}
      />
    );
  }
  return (
    <button onClick={() => setEditing(true)} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
      {label && <span style={{ fontSize: 12.5, color: P.textSecondary, flexShrink: 0 }}>{label}:</span>}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...textStyle }}>{value || "—"}</span>
      {saving ? <Loader2 size={11} className="animate-spin" style={{ flexShrink: 0, color: P.textMuted }} /> : saved ? <Check size={11} color={P.accent} style={{ flexShrink: 0 }} /> : null}
    </button>
  );
}

function VehicleRow({ vehicle, onUpdated, onDeleted }) {
  async function saveField(column, value) {
    const { data, error } = await supabase.from("vehicles").update({ [column]: value }).eq("id", vehicle.id).select().single();
    if (!error && data) onUpdated(data);
  }
  async function handleDelete() {
    const { error } = await supabase.from("vehicles").delete().eq("id", vehicle.id);
    if (!error) onDeleted(vehicle.id);
  }
  return (
    <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="color" value={vehicle.color_hex || "#4B5158"} onChange={(e) => saveField("color_hex", e.target.value)} title="Vehicle color" style={{ width: 26, height: 26, padding: 0, border: `1px solid ${P.border}`, borderRadius: 6, background: "transparent", cursor: "pointer", flexShrink: 0 }} />
        <EditableField value={vehicle.label} onSave={(v) => saveField("label", v || vehicle.label)} placeholder="2021 VW ID4" />
        <button onClick={handleDelete} title="Remove vehicle" style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", flexShrink: 0, display: "flex" }}><Trash2 size={13} /></button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <select value={vehicle.vehicle_type || "Car"} onChange={(e) => saveField("vehicle_type", e.target.value)} style={{ flex: 1, background: "transparent", border: `1px solid ${P.border}`, borderRadius: 7, padding: "5px 7px", color: P.textSecondary, fontSize: 11.5, outline: "none" }}>
          {["Car", "Motorcycle", "Boat", "RV & Trailer", "Aircraft", "Other"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={vehicle.size_class || "car"} onChange={(e) => saveField("size_class", e.target.value)} title="Controls which price this vehicle gets on quotes/invoices" style={{ flex: 1, background: "transparent", border: `1px solid ${P.border}`, borderRadius: 7, padding: "5px 7px", color: P.textSecondary, fontSize: 11.5, outline: "none" }}>
          <option value="car">Car pricing</option>
          <option value="suv_truck_van">SUV/Truck/Van pricing</option>
        </select>
      </div>
    </div>
  );
}

function CustomerDetail({ customer, vehicles, businessId, onClose, onUpdated, onDeleted, onVehicleAdded, onVehicleUpdated, onVehicleDeleted, onNavigate }) {
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("Car");
  const [newSize, setNewSize] = useState("car");
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vehicleError, setVehicleError] = useState("");
  const [deletingCustomer, setDeletingCustomer] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [jobs, setJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [servicesById, setServicesById] = useState({});
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    if (!customer?.id || !businessId) return;
    let cancelled = false;
    async function loadHistory() {
      setLoadingHistory(true);
      const [jobsRes, quotesRes, invoicesRes, servicesRes] = await Promise.all([
        supabase.from("jobs").select("id, status, scheduled_at, service_ids, vehicles(label)").eq("business_id", businessId).eq("customer_id", customer.id).order("scheduled_at", { ascending: false }),
        supabase.from("quotes").select("id, status, totals, created_at").eq("business_id", businessId).eq("customer_id", customer.id).order("created_at", { ascending: false }),
        supabase.from("invoices").select("id, status, amount, paid_at, created_at").eq("business_id", businessId).eq("customer_id", customer.id).order("created_at", { ascending: false }),
        supabase.from("services").select("id, name").eq("business_id", businessId),
      ]);
      if (cancelled) return;
      setJobs(jobsRes.data || []);
      setQuotes(quotesRes.data || []);
      setInvoices(invoicesRes.data || []);
      setServicesById(Object.fromEntries((servicesRes.data || []).map((s) => [s.id, s])));
      setLoadingHistory(false);
    }
    loadHistory();
    return () => { cancelled = true; };
  }, [customer?.id, businessId]);

  if (!customer) return null;
  const color = colorForId(customer.id);
  const totalSpent = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (Number(i.amount) || 0), 0);

  async function saveField(column, value) {
    const { data, error } = await supabase.from("customers").update({ [column]: value }).eq("id", customer.id).select().single();
    if (!error && data) onUpdated?.(data);
  }

  async function handleAddVehicle(e) {
    e.preventDefault();
    if (!newLabel.trim()) { setVehicleError('Enter a description, like "2021 VW ID4".'); return; }
    setSavingVehicle(true);
    setVehicleError("");
    const { data, error } = await supabase
      .from("vehicles")
      .insert({ business_id: businessId, label: newLabel.trim(), vehicle_type: newType, size_class: newSize, customer_id: customer.id })
      .select()
      .single();
    setSavingVehicle(false);
    if (error) { setVehicleError(error.message); return; }
    onVehicleAdded(data);
    setAddingVehicle(false);
    setNewLabel(""); setNewType("Car"); setNewSize("car");
  }

  async function handleDeleteCustomer() {
    const vehicleNote = vehicles.length > 0 ? ` Their ${vehicles.length === 1 ? "vehicle" : `${vehicles.length} vehicles`} will be deleted too.` : "";
    const historyNote = jobs.length + quotes.length + invoices.length > 0 ? " Existing jobs, quotes, and invoices will be kept for your records but will no longer show a customer name." : "";
    if (!window.confirm(`Delete ${customer.name}?${vehicleNote}${historyNote} This can't be undone.`)) return;
    setDeletingCustomer(true);
    setDeleteError("");
    const { error } = await supabase.from("customers").delete().eq("id", customer.id);
    setDeletingCustomer(false);
    if (error) { setDeleteError(error.message); return; }
    onDeleted?.(customer.id);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(440px, 100vw)", background: P.bg, borderLeft: `1px solid ${P.border}`, zIndex: 41, overflowY: "auto", boxShadow: "-20px 0 60px rgba(0,0,0,0.4)" }}>
        <div style={{ position: "sticky", top: 0, background: P.bg, borderBottom: `1px solid ${P.border}`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: `${color}22`, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials(customer.name)}</div>
            <div style={{ minWidth: 0 }}>
              <EditableField big value={customer.name} onSave={(v) => saveField("name", v || customer.name)} placeholder="Customer name" />
              <div style={{ fontSize: 11.5, color: P.textMuted }}>Customer since {formatDate(customer.created_at)}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex", flexShrink: 0 }}><X size={18} /></button>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {customer.phone ? (
              <a href={`tel:${customer.phone}`} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 9, padding: "9px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}><Phone size={13} /> Call</a>
            ) : (
              <span title="No phone on file" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textMuted, borderRadius: 9, padding: "9px", fontSize: 12.5, fontWeight: 600, opacity: 0.5, cursor: "default" }}><Phone size={13} /> Call</span>
            )}
            {customer.phone ? (
              <a href={`sms:${customer.phone}`} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 9, padding: "9px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}><MessageSquare size={13} /> Text</a>
            ) : (
              <span title="No phone on file" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textMuted, borderRadius: 9, padding: "9px", fontSize: 12.5, fontWeight: 600, opacity: 0.5, cursor: "default" }}><MessageSquare size={13} /> Text</span>
            )}
            {customer.address ? (
              <a href={directionsUrl(customer.address)} target="_blank" rel="noopener noreferrer" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 9, padding: "9px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}><Navigation size={13} /> Directions</a>
            ) : (
              <span title="No address on file" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textMuted, borderRadius: 9, padding: "9px", fontSize: 12.5, fontWeight: 600, opacity: 0.5, cursor: "default" }}><Navigation size={13} /> Directions</span>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, background: P.accentSoft, border: `1px solid ${P.accent}33`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, marginBottom: 4 }}>Total spent</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: P.accent }}>{loadingHistory ? "…" : money(totalSpent)}</div>
            </div>
            <div style={{ flex: 1, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, marginBottom: 4 }}>Jobs completed</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: P.textPrimary }}>{loadingHistory ? "…" : jobs.filter((j) => j.status === "completed").length}</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, marginBottom: 8 }}>Contact</div>
            <p style={{ fontSize: 10.5, color: P.textMuted, margin: "0 0 8px", fontStyle: "italic" }}>Tap any field to edit it.</p>
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                <EditableField label="Phone" value={customer.phone} placeholder="(555) 123-4567" onSave={(v) => saveField("phone", v)} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                <EditableField label="Email" type="email" value={customer.email} placeholder="jane@email.com" onSave={(v) => saveField("email", v)} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                <EditableField label="Address" value={customer.address} placeholder="123 Main St, City, ST 12345" onSave={(v) => saveField("address", v)} />
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted }}>Vehicles</div>
              {!addingVehicle && (
                <button onClick={() => setAddingVehicle(true)} style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: P.accent, fontSize: 11, fontWeight: 600, cursor: "pointer" }}><Plus size={11} /> Add</button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {vehicles.length === 0 && !addingVehicle && (
                <p style={{ fontSize: 12, color: P.textMuted, fontStyle: "italic", margin: 0 }}>No vehicles on file yet.</p>
              )}
              {vehicles.map((v) => (
                <VehicleRow key={v.id} vehicle={v} onUpdated={onVehicleUpdated} onDeleted={onVehicleDeleted} />
              ))}
              {addingVehicle && (
                <div style={{ border: `1px solid ${P.border}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  {vehicleError && <div style={{ fontSize: 12, color: P.danger }}>{vehicleError}</div>}
                  <input autoFocus value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="2021 VW ID4" style={inputStyle} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <select value={newType} onChange={(e) => setNewType(e.target.value)} style={{ flex: 1, ...inputStyle, padding: "7px 9px", fontSize: 12.5 }}>
                      {["Car", "Motorcycle", "Boat", "RV & Trailer", "Aircraft", "Other"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select value={newSize} onChange={(e) => setNewSize(e.target.value)} style={{ flex: 1, ...inputStyle, padding: "7px 9px", fontSize: 12.5 }}>
                      <option value="car">Car pricing</option>
                      <option value="suv_truck_van">SUV/Truck/Van pricing</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => { setAddingVehicle(false); setVehicleError(""); setNewLabel(""); }} style={{ flex: 1, background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 9, padding: "8px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                    <button type="button" onClick={handleAddVehicle} disabled={savingVehicle} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 9, padding: "8px", fontSize: 12, fontWeight: 700, cursor: savingVehicle ? "default" : "pointer" }}>
                      {savingVehicle ? <Loader2 size={12} className="animate-spin" /> : "Save vehicle"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, marginBottom: 8 }}>Service history</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {loadingHistory && <p style={{ fontSize: 12, color: P.textMuted, fontStyle: "italic", margin: 0 }}>Loading…</p>}
              {!loadingHistory && jobs.length === 0 && (
                <p style={{ fontSize: 12, color: P.textMuted, fontStyle: "italic", margin: 0 }}>No jobs scheduled yet.</p>
              )}
              {jobs.map((j) => {
                const names = (j.service_ids || []).map((id) => servicesById[id]?.name).filter(Boolean).join(", ");
                return (
                  <div key={j.id} onClick={() => onNavigate?.("schedule")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: "9px 12px", cursor: onNavigate ? "pointer" : "default" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: P.textPrimary }}>{j.scheduled_at ? formatDate(j.scheduled_at) : "Unscheduled"}</div>
                      <div style={{ fontSize: 11, color: P.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.vehicles?.label || "No vehicle"}{names ? ` · ${names}` : ""}</div>
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: statusBadgeColor(j.status), flexShrink: 0 }}>{JOB_STATUS_LABEL[j.status] || j.status}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, marginBottom: 8 }}>Quotes</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {loadingHistory && <p style={{ fontSize: 12, color: P.textMuted, fontStyle: "italic", margin: 0 }}>Loading…</p>}
              {!loadingHistory && quotes.length === 0 && (
                <p style={{ fontSize: 12, color: P.textMuted, fontStyle: "italic", margin: 0 }}>No quotes yet.</p>
              )}
              {quotes.map((q) => (
                <div key={q.id} onClick={() => onNavigate?.("quote")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: "9px 12px", cursor: onNavigate ? "pointer" : "default" }}>
                  <div style={{ fontSize: 12.5, color: P.textSecondary }}>{formatDate(q.created_at)}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: P.textPrimary }}>{q.totals?.isRange ? `${money(q.totals.rangeLow)}–${money(q.totals.rangeHigh)}` : money(q.totals?.total)}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: statusBadgeColor(q.status), textTransform: "capitalize" }}>{q.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            {deleteError && <div style={{ fontSize: 12.5, color: P.danger, marginBottom: 8 }}>{deleteError}</div>}
            <button type="button" onClick={handleDeleteCustomer} disabled={deletingCustomer} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", color: P.danger, border: `1px solid ${P.border}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: deletingCustomer ? "default" : "pointer" }}>
              {deletingCustomer ? <><Loader2 size={14} className="animate-spin" /> Deleting…</> : <><Trash2 size={14} /> Delete customer</>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------- Add Customer modal ---------------------------------- */

function AddCustomerModal({ businessId, onClose, onAdded }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    setError("");

    const { data, error: insertError } = await supabase
      .from("customers")
      .insert({ business_id: businessId, name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, address: address.trim() || null })
      .select()
      .single();

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onAdded(data);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(420px, calc(100vw - 32px))", background: P.bg, border: `1px solid ${P.border}`, borderRadius: 16, zIndex: 51, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: P.textPrimary }}>Add customer</span>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ fontSize: 12.5, color: P.danger }}>{error}</div>}
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: P.textSecondary, marginBottom: 6 }}>Name</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: P.textSecondary, marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@email.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: P.textSecondary, marginBottom: 6 }}>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: P.textSecondary, marginBottom: 6 }}>Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, City, ST 12345" style={inputStyle} />
            <p style={{ fontSize: 11, color: P.textMuted, margin: "6px 0 0" }}>Used for one-tap directions on their scheduled jobs.</p>
          </div>
          <button type="submit" disabled={saving} style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 10, padding: "11px 16px", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.85 : 1 }}>
            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : "Add customer"}
          </button>
        </form>
      </div>
    </>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function AtlasCustomers({ onNavigate, navParams, currentPage = "customers" }) {
  const { businessId, businessName, businessLogoUrl, loading: bizLoading, error: bizError } = useBusinessId();
  const now = useLiveClock();
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [customersError, setCustomersError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [detailCustomer, setDetailCustomer] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function handleCustomerUpdated(updated) {
    setCustomers((cs) => cs.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
    setDetailCustomer((c) => (c && c.id === updated.id ? { ...c, ...updated } : c));
  }
  function handleCustomerDeleted(id) {
    setCustomers((cs) => cs.filter((c) => c.id !== id));
    setVehicles((vs) => vs.filter((v) => v.customer_id !== id));
    setSelected((s) => s.filter((sid) => sid !== id));
    setDetailCustomer((c) => (c && c.id === id ? null : c));
  }
  function handleVehicleAdded(vehicle) {
    setVehicles((vs) => [...vs, vehicle]);
  }
  function handleVehicleUpdated(updated) {
    setVehicles((vs) => vs.map((v) => (v.id === updated.id ? updated : v)));
  }
  function handleVehicleDeleted(id) {
    setVehicles((vs) => vs.filter((v) => v.id !== id));
  }

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;

    async function load() {
      setLoadingCustomers(true);
      const [customersRes, vehiclesRes] = await Promise.all([
        supabase.from("customers").select("*").eq("business_id", businessId).order("name", { ascending: true }),
        supabase.from("vehicles").select("*").eq("business_id", businessId),
      ]);

      if (cancelled) return;
      if (customersRes.error) {
        setCustomersError(customersRes.error.message);
      } else {
        setCustomers(customersRes.data);
      }
      setVehicles(vehiclesRes.data || []);
      setLoadingCustomers(false);
    }

    load();
    return () => { cancelled = true; };
  }, [businessId]);

  // Deep-linked here from another page ("Recent quotes" on the dashboard,
  // etc.) with a specific customer to jump straight to. Tracked by object
  // identity so closing the drawer doesn't make it pop back open the next
  // time `customers` happens to re-render (e.g. after an unrelated edit).
  const consumedNavRef = useRef(null);
  useEffect(() => {
    if (!navParams?.customerId || customers.length === 0) return;
    if (consumedNavRef.current === navParams) return;
    const match = customers.find((c) => c.id === navParams.customerId);
    if (match) {
      setDetailCustomer(match);
      consumedNavRef.current = navParams;
    }
  }, [navParams, customers]);

  const loading = bizLoading || (!!businessId && loadingCustomers);
  const error = bizError || customersError;

  const filtered = customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || (c.phone || "").includes(query));
  const withEmail = customers.filter((c) => c.email).length;
  const missingPhone = customers.filter((c) => !c.phone).length;

  function toggleSelect(id) { setSelected((s) => (s.includes(id) ? s.filter((n) => n !== id) : [...s, id])); }

  function handleAdded(customer) {
    setCustomers((cs) => [...cs, customer].sort((a, b) => a.name.localeCompare(b.name)));
    setAddOpen(false);
  }

  function handleExport() {
    const rows = [["Name", "Email", "Phone", "Customer Since"]].concat(
      filtered.map((c) => [c.name, c.email || "", c.phone || "", formatDate(c.created_at)])
    );
    downloadCsv(rows, "customers.csv");
  }

  function handleBulkExport() {
    const targets = customers.filter((c) => selected.includes(c.id));
    const rows = [["Name", "Email", "Phone", "Customer Since"]].concat(
      targets.map((c) => [c.name, c.email || "", c.phone || "", formatDate(c.created_at)])
    );
    downloadCsv(rows, "customers-selected.csv");
  }

  async function handleBulkDelete() {
    const targets = customers.filter((c) => selected.includes(c.id));
    if (targets.length === 0) return;
    const vehicleCount = vehicles.filter((v) => selected.includes(v.customer_id)).length;
    const vehicleNote = vehicleCount > 0 ? ` ${vehicleCount === 1 ? "1 vehicle" : `${vehicleCount} vehicles`} of theirs will be deleted too.` : "";
    const label = targets.length === 1 ? targets[0].name : `${targets.length} customers`;
    if (!window.confirm(`Delete ${label}?${vehicleNote} Existing jobs, quotes, and invoices will be kept for your records but will no longer show a customer name. This can't be undone.`)) return;
    setBulkDeleting(true);
    const { error } = await supabase.from("customers").delete().in("id", selected);
    setBulkDeleting(false);
    if (error) { alert(error.message); return; }
    setCustomers((cs) => cs.filter((c) => !selected.includes(c.id)));
    setVehicles((vs) => vs.filter((v) => !selected.includes(v.customer_id)));
    setDetailCustomer((c) => (c && selected.includes(c.id) ? null : c));
    setSelected([]);
  }

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
              <span style={{ fontSize: 13, color: P.textSecondary, whiteSpace: "nowrap" }}>Customers <span style={{ color: P.textMuted }}>· {customers.length} total · {formatDateTime(now)}</span></span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button onClick={handleExport} disabled={filtered.length === 0} className="hidden lg:flex" style={{ alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: filtered.length === 0 ? "default" : "pointer", opacity: filtered.length === 0 ? 0.5 : 1 }}><Download size={13} /> Export</button>
            <button onClick={() => setAddOpen(true)} disabled={!businessId} style={{ display: "flex", alignItems: "center", gap: 6, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: businessId ? "pointer" : "default", opacity: businessId ? 1 : 0.6 }}><Plus size={14} /> Add Customer</button>
          </div>
        </div>

        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
            <StatCard label="Total Customers" value={customers.length} />
            <StatCard label="With Email" value={withEmail} sub={`${customers.length - withEmail} missing`} />
            <StatCard label="Missing Phone" value={missingPhone} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px", display: "flex", alignItems: "center", gap: 8, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: "9px 12px" }}>
              <Search size={15} color={P.textMuted} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or phone…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: P.textPrimary, fontSize: 13.5 }} />
            </div>
            <button style={{ display: "flex", alignItems: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 10, padding: "9px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <SlidersHorizontal size={13} /> Name A–Z <ChevronDown size={13} />
            </button>
          </div>

          {selected.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: P.accentSoft, border: `1px solid ${P.accent}33`, borderRadius: 10, padding: "9px 12px" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: P.accent, marginRight: "auto" }}>{selected.length} selected</span>
              <button onClick={handleBulkExport} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><Download size={12} /> Export selected</button>
              <button onClick={handleBulkDelete} disabled={bulkDeleting} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${P.border}`, color: P.danger, borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 700, cursor: bulkDeleting ? "default" : "pointer", opacity: bulkDeleting ? 0.6 : 1 }}>
                {bulkDeleting ? <><Loader2 size={12} className="animate-spin" /> Deleting…</> : <><Trash2 size={12} /> Delete selected</>}
              </button>
              <button onClick={() => setSelected([])} style={{ background: "transparent", border: "none", color: P.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "6px 4px" }}>Clear</button>
            </div>
          )}

          {loading ? (
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "40px 18px", textAlign: "center", fontSize: 13, color: P.textMuted, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Loader2 size={15} className="animate-spin" /> Loading customers…
            </div>
          ) : error ? (
            <div style={{ background: "rgba(255,107,94,0.1)", border: `1px solid ${P.danger}`, borderRadius: 14, padding: "18px", fontSize: 13, color: P.danger }}>{error}</div>
          ) : filtered.length === 0 ? (
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "40px 18px", textAlign: "center", fontSize: 13, color: P.textMuted }}>
              {customers.length === 0 ? "No customers yet — add your first one." : `No customers match "${query}"`}
            </div>
          ) : (
            <RowsView list={filtered} selected={selected} toggleSelect={toggleSelect} onOpenDetail={setDetailCustomer} />
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

      {addOpen && <AddCustomerModal businessId={businessId} onClose={() => setAddOpen(false)} onAdded={handleAdded} />}
      {detailCustomer && (
        <CustomerDetail
          customer={detailCustomer}
          vehicles={vehicles.filter((v) => v.customer_id === detailCustomer.id)}
          businessId={businessId}
          onClose={() => setDetailCustomer(null)}
          onUpdated={handleCustomerUpdated}
          onDeleted={handleCustomerDeleted}
          onVehicleAdded={handleVehicleAdded}
          onVehicleUpdated={handleVehicleUpdated}
          onVehicleDeleted={handleVehicleDeleted}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
