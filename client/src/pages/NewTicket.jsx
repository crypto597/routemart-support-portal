import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, label } from "../api.js";
import { useMeta } from "../App.jsx";

export default function NewTicket() {
  const meta = useMeta();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    title: "", description: "", customer_id: "", reporter_name: "",
    channel: "app", category: "duplicate-order", priority: "medium",
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("GET", "/customers").then(setCustomers);
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError("");
    try {
      const t = await api("POST", "/tickets", form);
      navigate(`/tickets/${t.id}`);
    } catch (err) {
      setErrors(err.details || {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link to="/" className="muted small back">← All tickets</Link>
      <div className="page-head"><h1>New ticket</h1></div>
      <form className="card form" onSubmit={submit} noValidate>
        {error && <div className="alert">{error}</div>}
        <Field label="Title" error={errors.title}>
          <input value={form.title} onChange={set("title")} placeholder="e.g. Duplicate order delivered to Laxmi Stores" />
        </Field>
        <Field label="Description" error={errors.description}>
          <textarea rows="5" value={form.description} onChange={set("description")} placeholder="What happened, which store, which order numbers…" />
        </Field>
        <div className="grid-2">
          <Field label="Customer" error={errors.customer_id}>
            <select value={form.customer_id} onChange={set("customer_id")}>
              <option value="">Select a distributor…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.city})</option>)}
            </select>
          </Field>
          <Field label="Reported by">
            <input value={form.reporter_name} onChange={set("reporter_name")} placeholder="Contact name" />
          </Field>
          <Field label="Category" error={errors.category}>
            <select value={form.category} onChange={set("category")}>
              {meta.categories.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </Field>
          <Field label="Priority" error={errors.priority}>
            <select value={form.priority} onChange={set("priority")}>
              {meta.priorities.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Channel" error={errors.channel}>
            <select value={form.channel} onChange={set("channel")}>
              {meta.channels.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div className="row gap">
          <button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create ticket"}</button>
          <Link to="/" className="btn btn-ghost">Cancel</Link>
        </div>
      </form>
    </>
  );
}

function Field({ label: text, error, children }) {
  return (
    <label className={`field ${error ? "has-error" : ""}`}>
      {text}
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
