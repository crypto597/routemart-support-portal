import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  STATUSES, PRIORITIES, CATEGORIES, CHANNELS, TRANSITIONS, nowIso, nextTicketId,
} from "./db.js";
import { login, logout, requireAuth } from "./auth.js";
import { summariseTicket, generateInsights, aiStatus } from "./ai.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const TICKET_SELECT = `
  SELECT t.*, c.name AS customer_name, c.city AS customer_city, c.tier AS customer_tier
  FROM tickets t JOIN customers c ON c.id = t.customer_id`;

function hydrate(row) {
  if (!row) return row;
  return { ...row, ai_summary: row.ai_summary ? JSON.parse(row.ai_summary) : null };
}

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: "100kb" }));

  // ---------------------------------------------------------------- public
  app.get("/api/health", (_req, res) => res.json({ ok: true, time: nowIso() }));

  app.post("/api/auth/login", (req, res) => {
    const result = login(db, req.body?.email, req.body?.password);
    if (!result) return res.status(401).json({ error: "Invalid email or password" });
    res.json(result);
  });

  // ---------------------------------------------------------------- protected
  const auth = requireAuth(db);
  app.use("/api", auth);

  app.get("/api/auth/me", (req, res) => res.json({ user: req.user }));
  app.post("/api/auth/logout", (req, res) => {
    logout(db, req.token);
    res.status(204).end();
  });

  app.get("/api/meta", (_req, res) =>
    res.json({ statuses: STATUSES, priorities: PRIORITIES, categories: CATEGORIES, channels: CHANNELS, transitions: TRANSITIONS, ai: aiStatus() })
  );

  app.get("/api/customers", (_req, res) => {
    res.json(db.prepare(`
      SELECT c.*, COUNT(t.id) AS ticket_count,
             SUM(CASE WHEN t.status NOT IN ('resolved','closed') THEN 1 ELSE 0 END) AS open_count
      FROM customers c LEFT JOIN tickets t ON t.customer_id = c.id
      GROUP BY c.id ORDER BY c.name`).all());
  });

  // GET /api/tickets?status=open&priority=high&category=sync&customer_id=CUS-001&q=duplicate&sort=priority
  app.get("/api/tickets", (req, res) => {
    const where = [];
    const params = {};
    for (const [field, allowed] of [["status", STATUSES], ["priority", PRIORITIES], ["category", CATEGORIES]]) {
      const v = req.query[field];
      if (v) {
        if (!allowed.includes(v)) throw new HttpError(400, `Invalid ${field}: ${v}`);
        where.push(`t.${field} = @${field}`);
        params[field] = v;
      }
    }
    if (req.query.customer_id) {
      where.push("t.customer_id = @customer_id");
      params.customer_id = String(req.query.customer_id);
    }
    if (req.query.q) {
      where.push("(t.title LIKE @q OR t.description LIKE @q OR t.id LIKE @q OR t.linked_jira LIKE @q)");
      params.q = `%${req.query.q}%`;
    }
    const order = req.query.sort === "priority"
      ? "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.created_at DESC"
      : "t.created_at DESC";
    const sql = `${TICKET_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order}`;
    res.json(db.prepare(sql).all(params).map(hydrate));
  });

  app.get("/api/tickets/:id", (req, res) => {
    const ticket = hydrate(db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(req.params.id));
    if (!ticket) throw new HttpError(404, `Ticket ${req.params.id} not found`);
    const events = db.prepare("SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY id").all(ticket.id);
    res.json({ ...ticket, events, allowed_transitions: TRANSITIONS[ticket.status] });
  });

  app.post("/api/tickets", (req, res) => {
    const b = req.body || {};
    const errors = {};
    const title = String(b.title || "").trim();
    const description = String(b.description || "").trim();
    if (title.length < 5 || title.length > 140) errors.title = "Title must be 5-140 characters";
    if (description.length < 10) errors.description = "Description must be at least 10 characters";
    if (!b.customer_id) errors.customer_id = "Select a customer";
    else if (!db.prepare("SELECT 1 FROM customers WHERE id = ?").get(b.customer_id)) errors.customer_id = "Unknown customer";
    const priority = b.priority || "medium";
    const category = b.category || "other";
    const channel = b.channel || "app";
    if (!PRIORITIES.includes(priority)) errors.priority = "Invalid priority";
    if (!CATEGORIES.includes(category)) errors.category = "Invalid category";
    if (!CHANNELS.includes(channel)) errors.channel = "Invalid channel";
    if (Object.keys(errors).length) throw new HttpError(400, "Validation failed", errors);

    const now = nowIso();
    const create = db.transaction(() => {
      const id = nextTicketId(db);
      db.prepare(`
        INSERT INTO tickets (id, title, description, customer_id, reporter_name, channel, category,
                             priority, status, assignee, linked_jira, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, ?, ?, ?)`)
        .run(id, title, description, b.customer_id, b.reporter_name || null, channel, category, priority,
             b.linked_jira || null, now, now);
      db.prepare("INSERT INTO ticket_events (ticket_id, type, actor, to_value, created_at) VALUES (?, 'created', ?, 'open', ?)")
        .run(id, req.user.name, now);
      return id;
    });
    const id = create();
    res.status(201).location(`/api/tickets/${id}`).json(hydrate(db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(id)));
  });

  // Partial update. Status changes are validated against the workflow.
  app.put("/api/tickets/:id", (req, res) => {
    const current = db.prepare("SELECT * FROM tickets WHERE id = ?").get(req.params.id);
    if (!current) throw new HttpError(404, `Ticket ${req.params.id} not found`);
    const b = req.body || {};
    const updates = {};
    const events = [];
    const actor = req.user.name;

    if (b.status !== undefined && b.status !== current.status) {
      if (!STATUSES.includes(b.status)) throw new HttpError(400, `Invalid status: ${b.status}`);
      if (!TRANSITIONS[current.status].includes(b.status)) {
        throw new HttpError(422, `Cannot move a ticket from ${current.status} to ${b.status}`, {
          allowed: TRANSITIONS[current.status],
        });
      }
      updates.status = b.status;
      events.push(["status_changed", current.status, b.status]);
    }
    if (b.priority !== undefined && b.priority !== current.priority) {
      if (!PRIORITIES.includes(b.priority)) throw new HttpError(400, `Invalid priority: ${b.priority}`);
      updates.priority = b.priority;
      events.push(["priority_changed", current.priority, b.priority]);
    }
    if (b.assignee !== undefined && b.assignee !== current.assignee) {
      updates.assignee = b.assignee || null;
      events.push(["assigned", current.assignee, b.assignee || null]);
    }
    if (b.linked_jira !== undefined && b.linked_jira !== current.linked_jira) {
      const key = b.linked_jira ? String(b.linked_jira).trim().toUpperCase() : null;
      if (key && !/^[A-Z][A-Z0-9]+-\d+$/.test(key)) throw new HttpError(400, "Jira key must look like OFFLINE-12");
      updates.linked_jira = key;
      events.push(["jira_linked", current.linked_jira, key]);
    }
    for (const f of ["title", "description"]) {
      if (b[f] !== undefined && String(b[f]).trim() && b[f] !== current[f]) updates[f] = String(b[f]).trim();
    }
    const comment = b.comment ? String(b.comment).trim() : "";

    if (!Object.keys(updates).length && !comment) throw new HttpError(400, "Nothing to update");

    const now = nowIso();
    db.transaction(() => {
      if (Object.keys(updates).length) {
        const sets = Object.keys(updates).map((k) => `${k} = @${k}`).join(", ");
        db.prepare(`UPDATE tickets SET ${sets}, updated_at = @now WHERE id = @id`).run({ ...updates, now, id: current.id });
      } else {
        db.prepare("UPDATE tickets SET updated_at = ? WHERE id = ?").run(now, current.id);
      }
      const ins = db.prepare(
        "INSERT INTO ticket_events (ticket_id, type, actor, from_value, to_value, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      );
      for (const [type, from, to] of events) ins.run(current.id, type, actor, from, to, null, now);
      if (comment) ins.run(current.id, "comment", actor, null, null, comment, now);
    })();

    const ticket = hydrate(db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(current.id));
    const allEvents = db.prepare("SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY id").all(current.id);
    res.json({ ...ticket, events: allEvents, allowed_transitions: TRANSITIONS[ticket.status] });
  });

  app.get("/api/stats", (_req, res) => {
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const r of db.prepare("SELECT status, COUNT(*) n FROM tickets GROUP BY status").all()) byStatus[r.status] = r.n;
    const byCategory = db.prepare(
      "SELECT category, COUNT(*) n FROM tickets WHERE status NOT IN ('resolved','closed') GROUP BY category ORDER BY n DESC"
    ).all();
    const urgentOpen = db.prepare(
      "SELECT COUNT(*) n FROM tickets WHERE priority IN ('urgent','high') AND status NOT IN ('resolved','closed')"
    ).get().n;
    res.json({ total: Object.values(byStatus).reduce((a, b) => a + b, 0), by_status: byStatus, open_by_category: byCategory, high_priority_open: urgentOpen });
  });

  // ---------------------------------------------------------------- AI
  app.post("/api/tickets/:id/summary", asyncRoute(async (req, res) => {
    const ticket = hydrate(db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(req.params.id));
    if (!ticket) throw new HttpError(404, `Ticket ${req.params.id} not found`);
    const events = db.prepare("SELECT type, actor, from_value, to_value, body, created_at FROM ticket_events WHERE ticket_id = ? ORDER BY id").all(ticket.id);
    const related = ticket.linked_jira
      ? db.prepare("SELECT COUNT(*) n FROM tickets WHERE linked_jira = ? AND id != ? AND status NOT IN ('resolved','closed')").get(ticket.linked_jira, ticket.id).n
      : 0;
    const { ai_summary: _omit, ...ticketForAi } = ticket;
    const summary = { ...(await summariseTicket(ticketForAi, events, related)), generated_at: nowIso() };
    const now = nowIso();
    db.prepare("UPDATE tickets SET ai_summary = ? WHERE id = ?").run(JSON.stringify(summary), ticket.id);
    db.prepare("INSERT INTO ticket_events (ticket_id, type, actor, body, created_at) VALUES (?, 'ai_summary', ?, ?, ?)")
      .run(ticket.id, summary.source === "claude" ? "AI assistant (Claude)" : "AI assistant (rules)", summary.summary, now);
    res.json(summary);
  }));

  app.get("/api/insights", asyncRoute(async (_req, res) => {
    const tickets = db.prepare(`${TICKET_SELECT} ORDER BY t.created_at DESC`).all();
    res.json(await generateInsights(tickets));
  }));

  // ---------------------------------------------------------------- frontend (production build)
  const dist = path.join(here, "..", "..", "client", "dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? "Internal server error" : err.message, ...(err.details ? { details: err.details } : {}) });
  });

  return app;
}
