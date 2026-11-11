import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, label, timeAgo } from "../api.js";
import { useMeta } from "../App.jsx";
import { StatusBadge, PriorityBadge, JiraChip } from "../components.jsx";

export default function TicketList() {
  const meta = useMeta();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tickets, setTickets] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState(params.get("q") || "");

  const filters = {
    status: params.get("status") || "",
    priority: params.get("priority") || "",
    category: params.get("category") || "",
    q: params.get("q") || "",
  };

  useEffect(() => {
    const qs = new URLSearchParams({ sort: "priority" });
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
    setTickets(null);
    api("GET", `/tickets?${qs}`).then(setTickets).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()]);

  useEffect(() => {
    api("GET", "/stats").then(setStats);
  }, []);

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  const openCount = stats ? stats.total - stats.by_status.resolved - stats.by_status.closed : "–";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tickets</h1>
          <p className="muted">Issues reported by distributors and field reps.</p>
        </div>
      </div>

      <div className="stats">
        <Stat value={openCount} label="Open tickets" />
        <Stat value={stats?.high_priority_open ?? "–"} label="High / urgent open" tone="warn" />
        <Stat value={stats?.open_by_category?.[0] ? label(stats.open_by_category[0].category) : "–"} label="Top open category" small />
        <Stat value={stats?.by_status?.resolved ?? "–"} label="Resolved, awaiting close" />
      </div>

      <div className="filters card">
        <form onSubmit={(e) => { e.preventDefault(); setFilter("q", q.trim()); }} className="search">
          <input placeholder="Search title, description, SUP-… or OFFLINE-…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <Select value={filters.status} onChange={(v) => setFilter("status", v)} options={meta.statuses} placeholder="All statuses" />
        <Select value={filters.priority} onChange={(v) => setFilter("priority", v)} options={meta.priorities} placeholder="All priorities" />
        <Select value={filters.category} onChange={(v) => setFilter("category", v)} options={meta.categories} placeholder="All categories" />
        {(filters.status || filters.priority || filters.category || filters.q) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setQ(""); setParams({}); }}>Clear</button>
        )}
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="card table-card">
        <table className="tickets">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Customer</th>
              <th>Category</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Jira</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {tickets === null && (
              <tr><td colSpan="7" className="muted center-cell">Loading…</td></tr>
            )}
            {tickets?.length === 0 && (
              <tr><td colSpan="7" className="muted center-cell">No tickets match these filters.</td></tr>
            )}
            {tickets?.map((t) => (
              <tr key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} className="clickable">
                <td>
                  <Link to={`/tickets/${t.id}`} className="mono small muted" onClick={(e) => e.stopPropagation()}>{t.id}</Link>
                  <div className="title-cell">{t.title}</div>
                </td>
                <td>
                  <div>{t.customer_name}</div>
                  <div className="muted small">{t.customer_city}</div>
                </td>
                <td className="small">{label(t.category)}</td>
                <td><PriorityBadge priority={t.priority} /></td>
                <td><StatusBadge status={t.status} /></td>
                <td><JiraChip jira={t.linked_jira} /></td>
                <td className="muted small nowrap">{timeAgo(t.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Stat({ value, label: text, tone, small }) {
  return (
    <div className={`card stat ${tone || ""}`}>
      <div className={`stat-value ${small ? "stat-small" : ""}`}>{value}</div>
      <div className="muted small">{text}</div>
    </div>
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{label(o)}</option>)}
    </select>
  );
}
