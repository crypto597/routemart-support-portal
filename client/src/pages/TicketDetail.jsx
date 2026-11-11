import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, label, timeAgo } from "../api.js";
import { useMeta } from "../App.jsx";
import { StatusBadge, PriorityBadge, JiraChip, AiSourceTag } from "../components.jsx";

export default function TicketDetail() {
  const { id } = useParams();
  const meta = useMeta();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState("");
  const [jira, setJira] = useState("");
  const [summarising, setSummarising] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setTicket(null);
    api("GET", `/tickets/${id}`)
      .then((t) => { setTicket(t); setJira(t.linked_jira || ""); })
      .catch((e) => setError(e.message));
  }, [id]);

  async function update(patch, message) {
    setSaving(true);
    setError("");
    try {
      const t = await api("PUT", `/tickets/${id}`, patch);
      setTicket(t);
      setJira(t.linked_jira || "");
      setNotice(message);
      setTimeout(() => setNotice(""), 2500);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function summarise() {
    setSummarising(true);
    setError("");
    try {
      const summary = await api("POST", `/tickets/${id}/summary`);
      const t = await api("GET", `/tickets/${id}`);
      setTicket({ ...t, ai_summary: summary });
    } catch (e) {
      setError(e.message);
    } finally {
      setSummarising(false);
    }
  }

  if (error && !ticket) return <div className="alert">{error} <Link to="/">Back to tickets</Link></div>;
  if (!ticket) return <div className="muted">Loading…</div>;

  const s = ticket.ai_summary;

  return (
    <>
      <Link to="/" className="muted small back">← All tickets</Link>
      <div className="page-head">
        <div>
          <div className="mono muted small">{ticket.id} · opened {timeAgo(ticket.created_at)} via {ticket.channel}</div>
          <h1>{ticket.title}</h1>
          <div className="row gap">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <span className="badge neutral">{label(ticket.category)}</span>
          </div>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {notice && <div className="toast">{notice}</div>}

      <div className="detail-grid">
        <div className="stack">
          <section className="card">
            <h3>Description</h3>
            <p className="pre">{ticket.description}</p>
            <div className="muted small">Reported by {ticket.reporter_name || "unknown"} · {ticket.customer_name}, {ticket.customer_city}</div>
          </section>

          <section className="card ai-card">
            <div className="row between">
              <h3>✦ AI summary</h3>
              <button className="btn btn-sm btn-ai" onClick={summarise} disabled={summarising}>
                {summarising ? "Thinking…" : s ? "Regenerate" : "Generate summary"}
              </button>
            </div>
            {!s && !summarising && <p className="muted small">Summarise this ticket, assess customer impact and suggest the next action.</p>}
            {summarising && <div className="skeleton" />}
            {s && !summarising && (
              <div className="ai-body">
                <p><b>{s.summary}</b></p>
                <dl>
                  <dt>Customer impact</dt><dd>{s.customer_impact}</dd>
                  <dt>Next action</dt><dd>{s.next_action}</dd>
                  <dt>Suggested priority</dt>
                  <dd>
                    <PriorityBadge priority={s.suggested_priority} />
                    {s.suggested_priority !== ticket.priority && (
                      <button className="btn btn-ghost btn-xs" disabled={saving}
                        onClick={() => update({ priority: s.suggested_priority, comment: `Priority changed to ${s.suggested_priority} based on AI suggestion.` }, "Priority updated")}>
                        Apply
                      </button>
                    )}
                  </dd>
                  <dt>Sentiment</dt><dd className={`sentiment ${s.sentiment}`}>{s.sentiment}</dd>
                </dl>
                <div className="row between small muted">
                  <AiSourceTag source={s.source} model={s.model} />
                  <span>{s.generated_at ? timeAgo(s.generated_at) : ""}</span>
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <h3>Activity</h3>
            <ol className="timeline">
              {ticket.events.map((e) => <EventItem key={e.id} e={e} />)}
            </ol>
            <form className="comment" onSubmit={async (e) => {
              e.preventDefault();
              if (!comment.trim()) return;
              if (await update({ comment }, "Comment added")) setComment("");
            }}>
              <textarea rows="2" placeholder="Add an internal note…" value={comment} onChange={(e) => setComment(e.target.value)} />
              <button className="btn btn-sm" disabled={saving || !comment.trim()}>Add note</button>
            </form>
          </section>
        </div>

        <aside className="stack">
          <section className="card">
            <h3>Status</h3>
            <p className="muted small">Move to:</p>
            <div className="transitions">
              {ticket.allowed_transitions.map((s2) => (
                <button key={s2} className={`btn btn-sm status-btn status-${s2}`} disabled={saving}
                  onClick={() => update({ status: s2 }, `Moved to ${label(s2)}`)}>
                  {label(s2)}
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <h3>Details</h3>
            <label className="field">
              Priority
              <select value={ticket.priority} disabled={saving} onChange={(e) => update({ priority: e.target.value }, "Priority updated")}>
                {meta.priorities.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="field">
              Assignee
              <select value={ticket.assignee || ""} disabled={saving} onChange={(e) => update({ assignee: e.target.value || null }, "Assignee updated")}>
                <option value="">Unassigned</option>
                {["Ananya Rao", "Neha Kulkarni", "Rohit Sharma"].map((a) => <option key={a}>{a}</option>)}
              </select>
            </label>
            <form className="field" onSubmit={(e) => { e.preventDefault(); update({ linked_jira: jira || null }, "Jira link updated"); }}>
              Linked Jira issue
              <div className="row gap">
                <input className="mono" value={jira} placeholder="OFFLINE-12" onChange={(e) => setJira(e.target.value)} />
                <button className="btn btn-sm" disabled={saving || jira === (ticket.linked_jira || "")}>Save</button>
              </div>
            </form>
            <div className="field">
              Customer
              <div>{ticket.customer_name} <span className="muted small">· {ticket.customer_tier}</span></div>
            </div>
            <div className="field">
              Engineering link
              <div><JiraChip jira={ticket.linked_jira} /></div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function EventItem({ e }) {
  const text = {
    created: <>created the ticket</>,
    status_changed: <>moved from <b>{label(e.from_value)}</b> to <b>{label(e.to_value)}</b></>,
    priority_changed: <>changed priority from <b>{e.from_value}</b> to <b>{e.to_value}</b></>,
    assigned: <>{e.to_value ? <>assigned to <b>{e.to_value}</b></> : <>unassigned the ticket</>}</>,
    jira_linked: <>{e.to_value ? <>linked Jira issue <b className="mono">{e.to_value}</b></> : <>removed the Jira link</>}</>,
    comment: <>added a note</>,
    ai_summary: <>generated a summary</>,
  }[e.type] || e.type;
  return (
    <li className={`ev ev-${e.type}`}>
      <div><b>{e.actor}</b> {text} <span className="muted small">· {timeAgo(e.created_at)}</span></div>
      {e.body && <div className="ev-body">{e.body}</div>}
    </li>
  );
}
