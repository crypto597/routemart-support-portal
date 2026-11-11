import { useEffect, useState, createContext, useContext } from "react";
import { Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api.js";
import Login from "./pages/Login.jsx";
import TicketList from "./pages/TicketList.jsx";
import TicketDetail from "./pages/TicketDetail.jsx";
import NewTicket from "./pages/NewTicket.jsx";
import Insights from "./pages/Insights.jsx";

const MetaContext = createContext(null);
export const useMeta = () => useContext(MetaContext);

export default function App() {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState(null);
  const [checking, setChecking] = useState(Boolean(getToken()));
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
    });
    if (!getToken()) return;
    api("GET", "/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (user) api("GET", "/meta").then(setMeta);
  }, [user]);

  async function signOut() {
    try {
      await api("POST", "/auth/logout");
    } catch {
      /* already signed out */
    }
    setToken(null);
    setUser(null);
    navigate("/");
  }

  if (checking) return <div className="center muted">Loading…</div>;
  if (!user) return <Login onLogin={(r) => { setToken(r.token); setUser(r.user); }} />;
  if (!meta) return <div className="center muted">Loading…</div>;

  return (
    <MetaContext.Provider value={meta}>
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <span className="logo" aria-hidden>
              <svg viewBox="0 0 32 32" width="26" height="26"><rect width="32" height="32" rx="8" fill="currentColor" /><path d="M9 21l5-10 4 7 2-3 3 6" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span>RouteMart <b>Support</b></span>
          </div>
          <nav>
            <NavLink to="/" end>Tickets</NavLink>
            <NavLink to="/insights">AI Insights</NavLink>
            <NavLink to="/tickets/new" className="btn btn-primary btn-sm">+ New ticket</NavLink>
          </nav>
          <div className="user">
            <span className="muted small">{user.name} · {user.role}</span>
            <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<TicketList />} />
            <Route path="/tickets/new" element={<NewTicket />} />
            <Route path="/tickets/:id" element={<TicketDetail />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </MetaContext.Provider>
  );
}
