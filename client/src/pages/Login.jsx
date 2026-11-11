import { useState } from "react";
import { api } from "../api.js";

// Test-only demo account for this prototype (see server/src/seed.js).
const DEMO = { email: "agent@routemart.test", password: "demo1234" };

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await api("POST", "/auth/login", { email, password }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <div className="brand big">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 32 32" width="34" height="34"><rect width="32" height="32" rx="8" fill="currentColor" /><path d="M9 21l5-10 4 7 2-3 3 6" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span>RouteMart <b>Support</b></span>
        </div>
        <p className="muted">Support portal for distributor partners and field sales reps.</p>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="alert">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setEmail(DEMO.email); setPassword(DEMO.password); }}>
          Use demo account
        </button>
      </form>
    </div>
  );
}
