import { useState } from "react";
import { Eye, EyeOff, ArrowRight, Check, Loader2 } from "lucide-react";
import { supabase, setAuthPersistence } from "./supabaseClient";

const P = {
  bg: "#06100C",
  bgTop: "#0B1813",
  border: "#1E2E25",
  textPrimary: "#EDF6F1",
  textSecondary: "#92AA9D",
  textMuted: "#566B5E",
  accent: "#18D97A",
  accentHover: "#35E890",
  secondary: "#FF7A63",
  accentSoft: "rgba(24,217,122,0.16)",
  danger: "#FF6B5E",
};

function AtlasMark({ size = 34 }) {
  const gid = "atlas-globe";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <radialGradient id={gid} cx="36%" cy="30%" r="75%">
          <stop offset="0%" stopColor={P.accentHover} />
          <stop offset="100%" stopColor={P.accent} />
        </radialGradient>
      </defs>
      <path d="M18 82 L49 33 L51 33 L82 82" stroke={P.accent} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="50" cy="31" r="18" fill={`url(#${gid})`} />
      <ellipse cx="44" cy="24" rx="6.5" ry="4.2" fill="rgba(255,255,255,0.38)" />
    </svg>
  );
}

export default function AtlasLogin() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");

  function toggleMode() {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setErrors({});
    setStatus("idle");
  }

  function startReset() {
    setMode("reset");
    setErrors({});
    setStatus("idle");
  }

  function goHome() {
    setMode("signin");
    setErrors({});
    setStatus("idle");
  }

  function validate() {
    const next = {};
    if (!email.trim()) next.email = "Enter your email address.";
    else if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "That email address doesn't look right.";
    if (!password) next.password = "Enter your password.";
    else if (password.length < 6) next.password = "Password must be at least 6 characters.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (status === "loading") return;
    if (!validate()) return;
    setStatus("loading");
    setAuthPersistence(remember);

    const { data, error } =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setErrors({ form: error.message });
      setStatus("idle");
      return;
    }

    // Signing up with email confirmation enabled returns a user but no session
    // yet — there's nothing for App's auth listener to pick up until they
    // confirm, so show that instead of the "signed in" animation.
    if (mode === "signup" && !data.session) {
      setStatus("check-email");
      return;
    }

    setStatus("success");
  }

  async function handleResetSubmit(e) {
    e.preventDefault();
    if (status === "loading") return;
    if (!email.trim()) { setErrors({ email: "Enter your email address." }); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErrors({ email: "That email address doesn't look right." }); return; }
    setErrors({});
    setStatus("loading");
    // Sends the user back to wherever this app is currently reachable from
    // (localhost, or the LAN address if opened from a phone) with a recovery
    // token in the URL — App.tsx picks that up via onAuthStateChange.
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) {
      setErrors({ form: error.message });
      setStatus("idle");
      return;
    }
    setStatus("reset-sent");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(160deg, ${P.bgTop}, ${P.bg})`,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "40px 20px",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      <div style={{ width: "100%", maxWidth: 400 }}>
        <button
          type="button"
          onClick={goHome}
          title="Back to sign in"
          style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 36, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
        >
          <AtlasMark size={32} />
          <span style={{ fontSize: 19, fontWeight: 700, color: P.textPrimary, letterSpacing: "0.01em" }}>Atlas</span>
        </button>

        {status === "success" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
              <Check size={22} color={P.accent} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: P.textPrimary, margin: "0 0 8px" }}>Signed in</h2>
            <p style={{ fontSize: 14, color: P.textSecondary, margin: 0 }}>
              Taking you to your dashboard…
            </p>
          </div>
        ) : status === "check-email" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
              <Check size={22} color={P.accent} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: P.textPrimary, margin: "0 0 8px" }}>Check your email</h2>
            <p style={{ fontSize: 14, color: P.textSecondary, margin: 0 }}>
              We sent a confirmation link to {email}. Confirm your address to finish creating your account.
            </p>
          </div>
        ) : status === "reset-sent" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
              <Check size={22} color={P.accent} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: P.textPrimary, margin: "0 0 8px" }}>Check your email</h2>
            <p style={{ fontSize: 14, color: P.textSecondary, margin: "0 0 20px" }}>
              If an account exists for {email}, we sent a password reset link to it.
            </p>
            <a href="#" onClick={(e) => { e.preventDefault(); setMode("signin"); setStatus("idle"); }} style={{ fontSize: 13.5, color: P.accent, textDecoration: "none", fontWeight: 600 }}>
              Back to sign in
            </a>
          </div>
        ) : mode === "reset" ? (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: P.textPrimary, margin: "0 0 6px", letterSpacing: "-0.01em" }}>Reset your password</h1>
            <p style={{ fontSize: 15, color: P.textSecondary, margin: "0 0 30px" }}>Enter your email and we'll send you a link to set a new one.</p>

            <form onSubmit={handleResetSubmit} noValidate>
              {errors.form && (
                <div style={{ background: "rgba(255,107,94,0.1)", border: `1px solid ${P.danger}`, borderRadius: 10, padding: "10px 14px", marginBottom: 18 }}>
                  <p style={{ fontSize: 13, color: P.danger, margin: 0 }}>{errors.form}</p>
                </div>
              )}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: P.textSecondary, marginBottom: 7 }}>Email</label>
                <input
                  type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourshop.com"
                  style={{
                    width: "100%", background: "transparent", border: `1px solid ${errors.email ? P.danger : P.border}`,
                    borderRadius: 10, padding: "11px 14px", fontSize: 14, color: P.textPrimary, outline: "none",
                  }}
                />
                {errors.email && <p style={{ fontSize: 12.5, color: P.danger, marginTop: 6 }}>{errors.email}</p>}
              </div>

              <button
                type="submit" disabled={status === "loading"}
                style={{
                  width: "100%", marginTop: 6, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`,
                  color: P.bg, border: "none", borderRadius: 10, padding: "12px 16px", fontSize: 14, fontWeight: 700,
                  cursor: status === "loading" ? "default" : "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 8, opacity: status === "loading" ? 0.85 : 1,
                }}
              >
                {status === "loading" ? (<><Loader2 size={16} className="animate-spin" />Sending…</>) : (<>Send reset link<ArrowRight size={16} /></>)}
              </button>
            </form>

            <p style={{ textAlign: "center", fontSize: 13.5, color: P.textMuted, marginTop: 26 }}>
              <a href="#" onClick={(e) => { e.preventDefault(); setMode("signin"); setErrors({}); setStatus("idle"); }} style={{ color: P.accent, textDecoration: "none", fontWeight: 600 }}>Back to sign in</a>
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: P.textPrimary, margin: "0 0 6px", letterSpacing: "-0.01em" }}>
              {mode === "signup" ? "Create your Atlas account" : "Sign in to Atlas"}
            </h1>
            <p style={{ fontSize: 15, color: P.textSecondary, margin: "0 0 30px" }}>
              {mode === "signup" ? "Get started — it only takes a minute." : "Welcome back. Enter your details to continue."}
            </p>

            <form onSubmit={handleSubmit} noValidate>
              {errors.form && (
                <div style={{ background: "rgba(255,107,94,0.1)", border: `1px solid ${P.danger}`, borderRadius: 10, padding: "10px 14px", marginBottom: 18 }}>
                  <p style={{ fontSize: 13, color: P.danger, margin: 0 }}>{errors.form}</p>
                </div>
              )}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: P.textSecondary, marginBottom: 7 }}>Email</label>
                <input
                  type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourshop.com"
                  style={{
                    width: "100%", background: "transparent", border: `1px solid ${errors.email ? P.danger : P.border}`,
                    borderRadius: 10, padding: "11px 14px", fontSize: 14, color: P.textPrimary, outline: "none",
                  }}
                />
                {errors.email && <p style={{ fontSize: 12.5, color: P.danger, marginTop: 6 }}>{errors.email}</p>}
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: P.textSecondary }}>Password</label>
                  {mode === "signin" && (
                    <a href="#" onClick={(e) => { e.preventDefault(); startReset(); }} style={{ fontSize: 12.5, color: P.textMuted, textDecoration: "none" }}>Forgot password?</a>
                  )}
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                    style={{
                      width: "100%", background: "transparent", border: `1px solid ${errors.password ? P.danger : P.border}`,
                      borderRadius: 10, padding: "11px 42px 11px 14px", fontSize: 14, color: P.textPrimary, outline: "none",
                    }}
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password visibility"
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex" }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p style={{ fontSize: 12.5, color: P.danger, marginTop: 6 }}>{errors.password}</p>}
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ accentColor: P.accent }} />
                <span style={{ fontSize: 13, color: P.textSecondary }}>Keep me signed in on this device</span>
              </label>

              <button
                type="submit" disabled={status === "loading"}
                style={{
                  width: "100%", marginTop: 20, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`,
                  color: P.bg, border: "none", borderRadius: 10, padding: "12px 16px", fontSize: 14, fontWeight: 700,
                  cursor: status === "loading" ? "default" : "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 8, opacity: status === "loading" ? 0.85 : 1,
                }}
              >
                {status === "loading" ? (
                  <><Loader2 size={16} className="animate-spin" />{mode === "signup" ? "Creating account…" : "Signing in…"}</>
                ) : (
                  <>{mode === "signup" ? "Create account" : "Sign in"}<ArrowRight size={16} /></>
                )}
              </button>
            </form>

            <p style={{ textAlign: "center", fontSize: 13.5, color: P.textMuted, marginTop: 26 }}>
              {mode === "signup" ? (
                <>Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); toggleMode(); }} style={{ color: P.accent, textDecoration: "none", fontWeight: 600 }}>Sign in</a></>
              ) : (
                <>New to Atlas? <a href="#" onClick={(e) => { e.preventDefault(); toggleMode(); }} style={{ color: P.accent, textDecoration: "none", fontWeight: 600 }}>Create an account</a></>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Landing screen for the link in a password-reset email. Supabase's redirect
// gives the browser a valid (temporary, recovery-only) session before this
// ever renders, so this only has to collect the new password and call
// updateUser — App.tsx is what decides to show this instead of the normal app.
export function SetNewPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success

  async function handleSubmit(e) {
    e.preventDefault();
    if (status === "loading") return;
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setError("");
    setStatus("loading");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) { setError(updateError.message); setStatus("idle"); return; }
    setStatus("success");
    setTimeout(() => onDone?.(), 1400);
  }

  return (
    <div
      style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: `linear-gradient(160deg, ${P.bgTop}, ${P.bg})`,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: "40px 20px",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 36 }}>
          <AtlasMark size={32} />
          <span style={{ fontSize: 19, fontWeight: 700, color: P.textPrimary, letterSpacing: "0.01em" }}>Atlas</span>
        </div>

        {status === "success" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
              <Check size={22} color={P.accent} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: P.textPrimary, margin: "0 0 8px" }}>Password updated</h2>
            <p style={{ fontSize: 14, color: P.textSecondary, margin: 0 }}>Taking you to your dashboard…</p>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: P.textPrimary, margin: "0 0 6px", letterSpacing: "-0.01em" }}>Set a new password</h1>
            <p style={{ fontSize: 15, color: P.textSecondary, margin: "0 0 30px" }}>Choose a new password for your Atlas account.</p>

            <form onSubmit={handleSubmit} noValidate>
              {error && (
                <div style={{ background: "rgba(255,107,94,0.1)", border: `1px solid ${P.danger}`, borderRadius: 10, padding: "10px 14px", marginBottom: 18 }}>
                  <p style={{ fontSize: 13, color: P.danger, margin: 0 }}>{error}</p>
                </div>
              )}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: P.textSecondary, marginBottom: 7 }}>New password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"} autoComplete="new-password" value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                    style={{ width: "100%", background: "transparent", border: `1px solid ${P.border}`, borderRadius: 10, padding: "11px 42px 11px 14px", fontSize: 14, color: P.textPrimary, outline: "none" }}
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password visibility"
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex" }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: P.textSecondary, marginBottom: 7 }}>Confirm password</label>
                <input
                  type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••"
                  style={{ width: "100%", background: "transparent", border: `1px solid ${P.border}`, borderRadius: 10, padding: "11px 14px", fontSize: 14, color: P.textPrimary, outline: "none" }}
                />
              </div>

              <button
                type="submit" disabled={status === "loading"}
                style={{
                  width: "100%", marginTop: 6, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`,
                  color: P.bg, border: "none", borderRadius: 10, padding: "12px 16px", fontSize: 14, fontWeight: 700,
                  cursor: status === "loading" ? "default" : "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 8, opacity: status === "loading" ? 0.85 : 1,
                }}
              >
                {status === "loading" ? (<><Loader2 size={16} className="animate-spin" />Saving…</>) : (<>Save password<ArrowRight size={16} /></>)}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
