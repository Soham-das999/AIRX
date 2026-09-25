import { useState } from "react";
import { Plane, Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";

const ink = "#0E1626", panel = "#141F35", panelAlt = "#182747", line = "#28395C",
  text = "#E9EEF7", muted = "#8CA0C4", marigold = "#E7A23A";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Enter both email and password.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    // Mock auth delay — replace with a real API call, e.g.:
    // const res = await fetch('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    setTimeout(() => {
      setLoading(false);
      onLogin?.({ email });
    }, 700);
  };

  return (
    <div style={{
      minHeight: "100vh", background: ink, color: text,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", padding: 20,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap');
        * { box-sizing: border-box; }
        .airx-input:focus { outline: none; border-color: ${marigold} !important; }
        .airx-btn:hover { filter: brightness(1.05); }
        .airx-btn:disabled { opacity: 0.6; cursor: default; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28, justifyContent: "center" }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: marigold, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Plane size={20} color={ink} />
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600 }}>AIRX</div>
        </div>

        <div style={{ background: panel, border: `1px solid ${line}`, borderRadius: 12, padding: 28 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
            Sign in
          </div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 22 }}>
            Access the airfare index dashboard.
          </div>

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: muted, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Email
              </label>
              <div style={{ position: "relative" }}>
                <Mail size={15} color={muted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
                <input
                  className="airx-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@ministry.gov.in"
                  autoComplete="email"
                  style={{
                    width: "100%", background: panelAlt, border: `1px solid ${line}`, borderRadius: 8,
                    padding: "10px 12px 10px 36px", fontSize: 14, color: text,
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, color: muted, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <Lock size={15} color={muted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
                <input
                  className="airx-input"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                  autoComplete="current-password"
                  style={{
                    width: "100%", background: panelAlt, border: `1px solid ${line}`, borderRadius: 8,
                    padding: "10px 36px 10px 36px", fontSize: 14, color: text,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", display: "flex" }}
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={15} color={muted} /> : <Eye size={15} color={muted} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#E06B6B" }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <a href="#" style={{ fontSize: 12.5, color: muted, textDecoration: "none" }}>
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="airx-btn"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                width: "100%", padding: "11px 14px", borderRadius: 8, border: "none",
                background: marigold, color: ink, fontSize: 14, fontWeight: 700, cursor: "pointer",
                marginTop: 4,
              }}
            >
              {loading ? "Signing in\u2026" : (<>Sign in <ArrowRight size={15} /></>)}
            </button>
          </form>
        </div>

        <div style={{ textAlign: "center", fontSize: 12.5, color: muted, marginTop: 16 }}>
          Prototype login \u2014 any valid-looking email/password combination will sign you in.
        </div>
      </div>
    </div>
  );
}
