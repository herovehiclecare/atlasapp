import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
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

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [recovery, setRecovery] = useState(isRecoveryUrl);

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

  return <Page onNavigate={setPage} currentPage={page} onSignOut={handleSignOut} />;
}
