import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, label } from "../api.js";
import { AiSourceTag, StatusBadge } from "../components.jsx";

export default function Insights() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    setError("");
    api("GET", "/insights")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const n = data?.narrative;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>✦ AI Insights</h1>
          <p className="muted">Recurring problems across all tickets, grouped by the engineering issue behind them.</p>
        </div>
        <button className="btn btn-ai" onClick={load} disabled={loading}>{loading ? "Analysing…" : "Re-run analysis"}</button>
      </div>

      {error && <div className="alert">{error}</div>}
      {!data && !error && <div className="card"><div className="skeleton" /><div className="skeleton" /></div>}

      {data && (
        <>
          <section className="card ai-card headline">
            <div className="row between">
              <h2>{n.headline}</h2>
            </div>
            {n.customer_at_risk && (
              <p className="risk">⚠ Customer at risk: <b>{n.customer_at_risk}</b></p>
            )}
            <AiSourceTag source={data.source} model={data.model} />
          </section>

          <div className="themes">
            {n.themes.map((t, i) => (
              <section className="card theme" key={i}>
                <div className="row between">
                  <h3>{t.title}</h3>
                  <span className="chip">{t.recommended_owner}</span>
                </div>
                <p>{t.why_it_matters}</p>
                <p className="small"><b>Recommendation:</b> {t.recommendation}</p>
                <p className="small muted">Evidence: {t.evidence}</p>
              </section>
            ))}
          </div>

          <h2 className="section-title">Ticket clusters</h2>
          <div className="card table-card">
            <table className="tickets">
              <thead>
                <tr><th>Engineering issue</th><th>Category</th><th>Tickets</th><th>Open</th><th>Customers affected</th><th>Tickets</th></tr>
              </thead>
              <tbody>
                {data.clusters.map((c) => (
                  <tr key={c.linked_jira || c.category}>
                    <td className="mono">
                      {c.linked_jira || <span className="muted">not linked</span>}
                      {c.suggested_jira && <div className="small ai-tag">✦ likely {c.suggested_jira.key}</div>}
                    </td>
                    <td className="small">{label(c.category)}</td>
                    <td>{c.ticket_count}</td>
                    <td>{c.open_count}</td>
                    <td className="small">{c.customers.join(", ")}</td>
                    <td className="small">
                      {c.tickets.map((t) => (
                        <Link key={t.id} to={`/tickets/${t.id}`} className="ticket-pill" title={t.title}>
                          {t.id} <StatusBadge status={t.status} />
                        </Link>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
