import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Every business-scoped page needs the current user's business_id before it
// can query anything (RLS is keyed off it) — this resolves it once via
// business_members so pages don't each re-derive the same lookup.
export function useBusinessId() {
  const [businessId, setBusinessId] = useState(null);
  const [businessName, setBusinessName] = useState("");
  const [businessLogoUrl, setBusinessLogoUrl] = useState("");
  const [businessTagline, setBusinessTagline] = useState("");
  const [businessQuoteLabel, setBusinessQuoteLabel] = useState("");
  const [businessInvoiceLabel, setBusinessInvoiceLabel] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessHours, setBusinessHours] = useState([]);
  const [businessNotificationPrefs, setBusinessNotificationPrefs] = useState({});
  const [businessUiPrefs, setBusinessUiPrefs] = useState({});
  const [businessDefaultTaxRate, setBusinessDefaultTaxRate] = useState(7);
  const [businessTaxEnabled, setBusinessTaxEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (cancelled) return;
        if (userError || !user) {
          setError("Couldn't verify your account. Try signing in again.");
          setLoading(false);
          return;
        }

        const { data, error: memberError } = await supabase
          .from("business_members")
          .select("business_id, businesses(name, logo_url, tagline, quote_label, invoice_label, phone, email, address, hours, notification_prefs, ui_prefs, default_tax_rate, tax_enabled)")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        if (cancelled) return;
        if (memberError || !data) {
          setError("Couldn't find a business linked to your account.");
        } else {
          setBusinessId(data.business_id);
          setBusinessName(data.businesses?.name || "");
          setBusinessLogoUrl(data.businesses?.logo_url || "");
          setBusinessTagline(data.businesses?.tagline || "");
          setBusinessQuoteLabel(data.businesses?.quote_label || "");
          setBusinessInvoiceLabel(data.businesses?.invoice_label || "");
          setBusinessPhone(data.businesses?.phone || "");
          setBusinessEmail(data.businesses?.email || "");
          setBusinessAddress(data.businesses?.address || "");
          setBusinessHours(data.businesses?.hours || []);
          setBusinessNotificationPrefs(data.businesses?.notification_prefs || {});
          setBusinessUiPrefs(data.businesses?.ui_prefs || {});
          setBusinessDefaultTaxRate(data.businesses?.default_tax_rate ?? 7);
          setBusinessTaxEnabled(data.businesses?.tax_enabled ?? true);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Something went wrong loading your business.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { businessId, businessName, businessLogoUrl, businessTagline, businessQuoteLabel, businessInvoiceLabel, businessPhone, businessEmail, businessAddress, businessHours, businessNotificationPrefs, businessUiPrefs, businessDefaultTaxRate, businessTaxEnabled, loading, error };
}
