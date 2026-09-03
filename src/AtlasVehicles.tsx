import { useState, useEffect, useRef } from "react";
import {
  LayoutGrid, Calendar, Users, Car, Receipt, Settings, Plus,
  Sparkles, Search, MoreHorizontal, SlidersHorizontal, ChevronDown,
  Pencil, Camera, Download,
  Ship, Plane, HelpCircle, X, Check, Loader2, ListChecks, Trash2,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { useBusinessId } from "./useBusinessId";
import { formatDate, downloadCsv, resizeImageToDataUrl, useLiveClock, formatDateTime } from "./lib";

function IconMotorcycle({ size = 24, color = "currentColor", ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <circle cx="5" cy="17" r="3" />
      <circle cx="19" cy="17" r="3" />
      <path d="M5 17h4l3-6h4l3 6" />
      <path d="M13 11l2-3h2" />
    </svg>
  );
}
function IconRV({ size = 24, color = "currentColor", ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M2 16Q2 10 6 9h12q2 0 2 2v5Z" />
      <line x1="3" y1="13.5" x2="20" y2="13.5" />
      <rect x="5" y="10.4" width="3" height="2.2" rx="0.3" />
      <rect x="9.5" y="10.4" width="3" height="2.2" rx="0.3" />
      <rect x="16" y="10.2" width="2.6" height="5.4" rx="0.6" />
      <circle cx="8" cy="17.3" r="1.8" />
    </svg>
  );
}

const TYPE_ICON = { Car, Motorcycle: IconMotorcycle, Boat: Ship, "RV & Trailer": IconRV, Aircraft: Plane, Other: HelpCircle };
const BASE_TYPES = ["Car", "Motorcycle", "Boat", "RV & Trailer", "Aircraft", "Other"];
const SIZE_CLASSES = [
  { value: "car", label: "Car" },
  { value: "suv_truck_van", label: "SUV / Truck / Van" },
];
const SIZE_LABEL = Object.fromEntries(SIZE_CLASSES.map((s) => [s.value, s.label]));

const P = {
  bg: "#06100C", bgTop: "#0B1813", surface: "#0F1B15", surfaceHover: "#132018",
  border: "#1E2E25", textPrimary: "#EDF6F1", textSecondary: "#92AA9D", textMuted: "#566B5E",
  accent: "#18D97A", accentHover: "#35E890", secondary: "#FF7A63",
  accentSoft: "rgba(24,217,122,0.14)", secondarySoft: "rgba(255,122,99,0.14)", danger: "#FF6B5E",
};
const HUES = ["#18D97A", "#4C8DFF", "#9B6BFF", "#F5A623", "#FF7A63", "#4FD1C5"];

const inputStyle = {
  width: "100%", background: "transparent", border: `1px solid ${P.border}`,
  borderRadius: 10, padding: "10px 12px", fontSize: 13.5, color: P.textPrimary, outline: "none", boxSizing: "border-box",
};
const labelStyle = { display: "block", fontSize: 12.5, fontWeight: 500, color: P.textSecondary, marginBottom: 6 };

function AtlasMark({ size = 24 }) {
  const gid = "atlas-globe-vehicles";
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

function hue(i) { return HUES[((i % HUES.length) + HUES.length) % HUES.length]; }
function initials(name) { return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(); }

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

function StatCard({ label, value, sub, tone }) {
  return (
    <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone || P.textPrimary, marginTop: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: P.textSecondary, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function VehicleCard({ v, i, onEdit }) {
  const TypeIcon = TYPE_ICON[v.vehicle_type] || HelpCircle;
  const ownerName = v.customers?.name;
  return (
    <div onClick={() => onEdit(v)} title="Click to edit" style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 16, overflow: "hidden", cursor: "pointer" }}>
      <div style={{ height: 64, background: v.color_hex || P.surfaceHover, position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.16), transparent 60%)" }} />
        <span style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 7, background: "rgba(0,0,0,0.45)" }}>
          <TypeIcon size={13} color="rgba(255,255,255,0.9)" />
        </span>
        {v.color_hex && <span style={{ position: "absolute", bottom: 8, left: 14, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "rgba(255,255,255,0.75)" }}>{v.color_hex}</span>}
      </div>

      <div style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: P.textPrimary }}>{v.label}</div>
        <div style={{ fontSize: 12, color: P.textMuted, marginTop: 1 }}>{v.vehicle_type} · {SIZE_LABEL[v.size_class] || v.size_class}</div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          {ownerName ? (
            <>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${hue(i)}22`, color: hue(i), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, flexShrink: 0 }}>{initials(ownerName)}</div>
              <span style={{ fontSize: 12.5, color: P.textSecondary }}>{ownerName}</span>
            </>
          ) : (
            <span style={{ fontSize: 12.5, color: P.textMuted, fontStyle: "italic" }}>No owner assigned</span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${P.border}` }}>
          <span style={{ fontSize: 11, color: P.textMuted }}>Added {formatDate(v.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Add Vehicle modal ---------------------------------- */

function AddVehicleModal({ businessId, customers, vehicle, onClose, onAdded, onUpdated, onDeleted }) {
  const isEdit = !!vehicle;
  const [label, setLabel] = useState(vehicle?.label || "");
  const [vehicleType, setVehicleType] = useState(
    vehicle && !BASE_TYPES.includes(vehicle.vehicle_type) ? "Custom…" : vehicle?.vehicle_type || "Car"
  );
  const [customType, setCustomType] = useState(
    vehicle && !BASE_TYPES.includes(vehicle.vehicle_type) ? vehicle.vehicle_type : ""
  );
  const [sizeClass, setSizeClass] = useState(vehicle?.size_class || "car");
  const [colorHex, setColorHex] = useState(vehicle?.color_hex || "#4B5158");
  const [customerId, setCustomerId] = useState(vehicle?.customer_id || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!label.trim()) {
      setError('Enter a description, like "2021 VW ID4".');
      return;
    }
    const type = vehicleType === "Custom…" ? customType.trim() : vehicleType;
    if (!type) {
      setError("Enter a vehicle type.");
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      label: label.trim(),
      vehicle_type: type,
      size_class: sizeClass,
      color_hex: colorHex || null,
      customer_id: customerId || null,
    };

    if (isEdit) {
      const { data, error: updateError } = await supabase
        .from("vehicles")
        .update(payload)
        .eq("id", vehicle.id)
        .select("*, customers(name)")
        .single();
      setSaving(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      onUpdated(data);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("vehicles")
      .insert({ business_id: businessId, ...payload })
      .select("*, customers(name)")
      .single();

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onAdded(data);
  }

  async function handleDelete() {
    if (!window.confirm("Delete this vehicle? This can't be undone.")) return;
    setDeleting(true);
    const { error: deleteError } = await supabase.from("vehicles").delete().eq("id", vehicle.id);
    setDeleting(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    onDeleted(vehicle.id);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(440px, calc(100vw - 32px))", maxHeight: "calc(100vh - 40px)", overflowY: "auto", background: P.bg, border: `1px solid ${P.border}`, borderRadius: 16, zIndex: 51, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: P.textPrimary }}>{isEdit ? "Edit vehicle" : "Add vehicle"}</span>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ fontSize: 12.5, color: P.danger }}>{error}</div>}
          <div>
            <label style={labelStyle}>Description</label>
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="2021 VW ID4" style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Type</label>
              <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} style={inputStyle}>
                {BASE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value="Custom…">Custom…</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Size class</label>
              <select value={sizeClass} onChange={(e) => setSizeClass(e.target.value)} style={inputStyle}>
                {SIZE_CLASSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          {vehicleType === "Custom…" && (
            <div>
              <label style={labelStyle}>Custom type</label>
              <input value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="e.g. Golf Cart" style={inputStyle} />
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <div>
              <label style={labelStyle}>Color</label>
              <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} style={{ ...inputStyle, padding: "3px 4px", height: 38, width: 56 }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Owner</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inputStyle}>
                <option value="">No owner</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={saving} style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 10, padding: "11px 16px", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.85 : 1 }}>
            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : isEdit ? "Save changes" : "Add vehicle"}
          </button>
          {isEdit && (
            <button type="button" onClick={handleDelete} disabled={deleting} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", color: P.danger, border: `1px solid ${P.border}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: deleting ? "default" : "pointer" }}>
              {deleting ? <><Loader2 size={14} className="animate-spin" /> Deleting…</> : <><Trash2 size={14} /> Delete vehicle</>}
            </button>
          )}
        </form>
      </div>
    </>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function AtlasVehicles({ onNavigate, currentPage = "vehicles" }) {
  const { businessId, businessName, businessLogoUrl, loading: bizLoading, error: bizError } = useBusinessId();
  const now = useLiveClock();
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [vehiclesError, setVehiclesError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [customTypes, setCustomTypes] = useState([]);
  const [addingType, setAddingType] = useState(false);
  const [newType, setNewType] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;

    async function load() {
      setLoadingVehicles(true);
      const [vehiclesResult, customersResult] = await Promise.all([
        supabase.from("vehicles").select("*, customers(name)").eq("business_id", businessId).order("created_at", { ascending: false }),
        supabase.from("customers").select("id, name").eq("business_id", businessId).order("name", { ascending: true }),
      ]);

      if (cancelled) return;
      if (vehiclesResult.error) {
        setVehiclesError(vehiclesResult.error.message);
      } else {
        setVehicles(vehiclesResult.data);
      }
      setCustomers(customersResult.data || []);
      setLoadingVehicles(false);
    }

    load();
    return () => { cancelled = true; };
  }, [businessId]);

  const loading = bizLoading || (!!businessId && loadingVehicles);
  const error = bizError || vehiclesError;

  const typesInUse = [...new Set(vehicles.map((v) => v.vehicle_type))];
  const allTypes = [...new Set([...BASE_TYPES, ...typesInUse, ...customTypes])];

  const searched = vehicles.filter((v) =>
    `${v.label} ${v.customers?.name || ""}`.toLowerCase().includes(query.toLowerCase())
  );
  const filtered = typeFilter === "All" ? searched : searched.filter((v) => v.vehicle_type === typeFilter);

  const withoutOwner = vehicles.filter((v) => !v.customer_id).length;

  function submitCustomType() {
    const trimmed = newType.trim();
    if (trimmed && !allTypes.includes(trimmed)) {
      setCustomTypes((t) => [...t, trimmed]);
      setTypeFilter(trimmed);
    }
    setNewType("");
    setAddingType(false);
  }

  function handleAdded(vehicle) {
    setVehicles((vs) => [vehicle, ...vs]);
    setAddOpen(false);
  }

  function handleVehicleUpdated(vehicle) {
    setVehicles((vs) => vs.map((v) => (v.id === vehicle.id ? vehicle : v)));
    setEditingVehicle(null);
  }

  function handleVehicleDeleted(id) {
    setVehicles((vs) => vs.filter((v) => v.id !== id));
    setEditingVehicle(null);
  }

  function handleExport() {
    const rows = [["Description", "Type", "Size Class", "Color", "Owner", "Added"]].concat(
      filtered.map((v) => [v.label, v.vehicle_type, SIZE_LABEL[v.size_class] || v.size_class, v.color_hex || "", v.customers?.name || "", formatDate(v.created_at)])
    );
    downloadCsv(rows, "vehicles.csv");
  }

  return (
    <div style={{ minHeight: "100vh", background: P.bg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap');`}</style>

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
              <span style={{ fontSize: 13, color: P.textSecondary, whiteSpace: "nowrap" }}>Vehicles <span style={{ color: P.textMuted }}>· {vehicles.length} total · {formatDateTime(now)}</span></span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button onClick={handleExport} disabled={filtered.length === 0} className="hidden lg:flex" style={{ alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: filtered.length === 0 ? "default" : "pointer", opacity: filtered.length === 0 ? 0.5 : 1 }}><Download size={13} /> Export</button>
            <button onClick={() => setAddOpen(true)} disabled={!businessId} style={{ display: "flex", alignItems: "center", gap: 6, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: businessId ? "pointer" : "default", opacity: businessId ? 1 : 0.6 }}><Plus size={14} /> Add Vehicle</button>
          </div>
        </div>

        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
            <StatCard label="Total Vehicles" value={vehicles.length} sub="across all customers" />
            <StatCard label="Vehicle Types" value={typesInUse.length} sub={typesInUse.join(", ") || "none yet"} />
            <StatCard label="No Owner Assigned" value={withoutOwner} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px", display: "flex", alignItems: "center", gap: 8, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: "9px 12px" }}>
              <Search size={15} color={P.textMuted} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by description or owner…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: P.textPrimary, fontSize: 13.5 }} />
            </div>
            <button style={{ display: "flex", alignItems: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 10, padding: "9px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <SlidersHorizontal size={13} /> Newest <ChevronDown size={13} />
            </button>
          </div>

          {/* type filter pills */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={() => setTypeFilter("All")}
              style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 20, cursor: "pointer", border: `1px solid ${typeFilter === "All" ? P.accent : P.border}`, background: typeFilter === "All" ? P.accentSoft : "transparent", color: typeFilter === "All" ? P.accent : P.textSecondary }}
            >
              All ({vehicles.length})
            </button>
            {allTypes.map((t) => {
              const TypeIcon = TYPE_ICON[t] || HelpCircle;
              const count = vehicles.filter((v) => v.vehicle_type === t).length;
              const isActive = typeFilter === t;
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 20, cursor: "pointer", border: `1px solid ${isActive ? P.accent : P.border}`, background: isActive ? P.accentSoft : "transparent", color: isActive ? P.accent : P.textSecondary }}
                >
                  <TypeIcon size={12} /> {t} ({count})
                </button>
              );
            })}

            {!addingType ? (
              <button onClick={() => setAddingType(true)} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 20, cursor: "pointer", border: `1px dashed ${P.border}`, background: "transparent", color: P.textMuted }}>
                <Plus size={12} /> Custom type
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  autoFocus value={newType} onChange={(e) => setNewType(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitCustomType()}
                  placeholder="e.g. Aircraft"
                  style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 20, padding: "6px 12px", fontSize: 12, color: P.textPrimary, outline: "none", width: 120 }}
                />
                <button onClick={submitCustomType} style={{ width: 26, height: 26, borderRadius: "50%", background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Check size={13} /></button>
                <button onClick={() => { setAddingType(false); setNewType(""); }} style={{ width: 26, height: 26, borderRadius: "50%", background: "transparent", border: `1px solid ${P.border}`, color: P.textMuted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={13} /></button>
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "40px 18px", textAlign: "center", fontSize: 13, color: P.textMuted, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Loader2 size={15} className="animate-spin" /> Loading vehicles…
            </div>
          ) : error ? (
            <div style={{ background: "rgba(255,107,94,0.1)", border: `1px solid ${P.danger}`, borderRadius: 14, padding: "18px", fontSize: 13, color: P.danger }}>{error}</div>
          ) : filtered.length === 0 ? (
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "40px 18px", textAlign: "center", fontSize: 13, color: P.textMuted }}>
              {vehicles.length === 0 ? "No vehicles yet — add your first one." : `No vehicles match${query ? ` "${query}"` : ""}${typeFilter !== "All" ? ` in ${typeFilter}` : ""}.`}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {filtered.map((v, i) => <VehicleCard key={v.id} v={v} i={i} onEdit={setEditingVehicle} />)}
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

      {(addOpen || editingVehicle) && (
        <AddVehicleModal
          businessId={businessId}
          customers={customers}
          vehicle={editingVehicle}
          onClose={() => { setAddOpen(false); setEditingVehicle(null); }}
          onAdded={handleAdded}
          onUpdated={handleVehicleUpdated}
          onDeleted={handleVehicleDeleted}
        />
      )}
    </div>
  );
}
