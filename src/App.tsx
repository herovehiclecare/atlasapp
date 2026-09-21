import { useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { supabase } from "./supabaseClient";
import { useBusinessId } from "./useBusinessId";
import AtlasLogin, { SetNewPassword } from "./AtlasLoginFinal";
import AtlasDashboardFinal from "./AtlasDashboardFinal";
import AtlasVehicles from "./AtlasVehicles";
import AtlasCustomers from "./AtlasCustomersFinal";
import AtlasSchedule from "./AtlasSchedule";
import AtlasInvoices from "./AtlasInvoices";
import AtlasSettings from "./AtlasSettings";
import AtlasQuickQuotePro from "./AtlasQuickQuotePro";
import AtlasFollowUps from "./AtlasFollowUps";

// Single source of truth for which page is showing. Every page reads
// `currentPage` to highlight its own nav item, and calls `onNavigate(id)`
// to switch screens — same contract on every page, so wiring a new one in
// later is just one more case below.
const PAGES = {
  dashboard: AtlasDashboardFinal,
  vehicles: AtlasVehicles,
  customers: AtlasCustomers,
  quote: AtlasQuickQuotePro,
  schedule: AtlasSchedule,
  followups: AtlasFollowUps,
  invoices: AtlasInvoices,
  settings: AtlasSettings,
};

// Supabase's password-reset email links back to this app with a recovery
// token in the URL (hash for the implicit flow, query string for PKCE) —
// checking for it synchronously, before any async auth call resolves, means
// a reset-link visitor never risks a frame of the real dashboard rendering
// ahead of the recovery screen while getSession() and onAuthStateChange
// race each other.
function isRecoveryUrl() {
  if (typeof window === "undefined") return false;
  return /type=recovery/.test(window.location.hash) || /type=recovery/.test(window.location.search);
}

// A small toast that pops up over whichever page is showing when a new
// Facebook lead lands — lives here (not inside a specific page) so it fires
// no matter where in Atlas you happen to be looking when the lead comes in.
function LeadToast({ lead, onView, onDismiss }) {
  return (
    <div
      role="status"
      style={{
        position: "fixed", top: 18, right: 18, zIndex: 9999, maxWidth: 340,
        background: "#0F1B15", border: "1px solid #1E2E25", borderRadius: 14,
        boxShadow: "0 12px 32px rgba(0,0,0,0.45)", padding: 16,
        display: "flex", gap: 12, alignItems: "flex-start",
        animation: "atlas-lead-toast-in 0.25s ease-out",
      }}
    >
      <style>{`@keyframes atlas-lead-toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(24,217,122,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <UserPlus size={18} color="#18D97A" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#EDF6F1" }}>New Facebook lead</div>
        <div style={{ fontSize: 12.5, color: "#92AA9D", marginTop: 2 }}>{lead.name || "A new lead"} just came in — reach out fast.</div>
        {lead.created_at && (
          <div style={{ fontSize: 11, color: "#566B5E", marginTop: 2 }}>
            {new Date(lead.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </div>
        )}
        <button
          onClick={onView}
          style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "#18D97A", background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          View customer →
        </button>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{ background: "none", border: "none", color: "#566B5E", cursor: "pointer", padding: 2, flexShrink: 0 }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [navParams, setNavParams] = useState(null);
  const [recovery, setRecovery] = useState(isRecoveryUrl);
  const [leadToast, setLeadToast] = useState(null);
  const { businessId } = useBusinessId();

  // Lets a row on one page ("this quote", "this customer's job") jump
  // straight to the relevant record on another page, instead of just
  // landing on that page's generic list — e.g. onNavigate("customers", { customerId })
  // opens that customer's profile directly. Params are optional; plain
  // onNavigate(id) calls elsewhere keep working unchanged.
  function navigate(id, params) {
    setNavParams(params || null);
    setPage(id);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // A password-reset link logs the user in via a temporary recovery
      // session — without this check they'd land straight in the dashboard
      // having never actually set a new password.
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        setSession(session);
        return;
      }
      // On sign-in, hold off swapping away from the login screen for a beat so
      // its "Signed in" checkmark animation gets to play before the dashboard appears.
      if (event === "SIGNED_IN") {
        setTimeout(() => setSession(session), 850);
      } else {
        setSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Live popup for a brand-new Facebook lead, wherever in Atlas you're
  // looking when it arrives. Filtered server-side to this business only;
  // the source check happens client-side since Realtime's postgres_changes
  // filter only supports one equality clause per subscription.
  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`lead-alerts-${businessId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "customers", filter: `business_id=eq.${businessId}` },
        (payload) => {
          if (payload.new?.source === "facebook_lead_ads") {
            setLeadToast(payload.new);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [businessId]);

  useEffect(() => {
    if (!leadToast) return;
    const t = setTimeout(() => setLeadToast(null), 12000);
    return () => clearTimeout(t);
  }, [leadToast]);

  function handleSignOut() {
    supabase.auth.signOut();
    setPage("dashboard");
  }

  if (loading) return null;

  if (recovery) {
    return <SetNewPassword onDone={() => setRecovery(false)} />;
  }

  if (!session) {
    return <AtlasLogin />;
  }

  const Page = PAGES[page] || AtlasDashboardFinal;

  return (
    <>
      <Page onNavigate={navigate} navParams={navParams} currentPage={page} onSignOut={handleSignOut} />
      {leadToast && (
        <LeadToast
          lead={leadToast}
          onDismiss={() => setLeadToast(null)}
          onView={() => { navigate("customers", { customerId: leadToast.id }); setLeadToast(null); }}
        />
      )}
    </>
  );
}
