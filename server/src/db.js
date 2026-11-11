import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(here, "..", "data", "support.db");

// ---- Domain enums (single source of truth, also exposed via GET /api/meta) ----
export const STATUSES = ["open", "in_progress", "waiting_on_customer", "resolved", "closed"];
export const PRIORITIES = ["low", "medium", "high", "urgent"];
export const CATEGORIES = [
  "duplicate-order",
  "sync",
  "pricing",
  "crash",
  "performance",
  "account",
  "feature-request",
  "other",
];
export const CHANNELS = ["app", "phone", "email", "whatsapp"];

// Allowed status transitions: a tiny workflow engine.
export const TRANSITIONS = {
  open: ["in_progress", "waiting_on_customer", "resolved", "closed"],
  in_progress: ["open", "waiting_on_customer", "resolved"],
  waiting_on_customer: ["in_progress", "resolved", "closed"],
  resolved: ["closed", "open"],
  closed: ["open"],
};

export function openDb(file = DB_PATH) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      city        TEXT NOT NULL,
      tier        TEXT NOT NULL CHECK (tier IN ('tier-1','tier-2','tier-3')),
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id            TEXT PRIMARY KEY,               -- SUP-1001
      title         TEXT NOT NULL,
      description   TEXT NOT NULL,
      customer_id   TEXT NOT NULL REFERENCES customers(id),
      reporter_name TEXT,
      channel       TEXT NOT NULL DEFAULT 'app',
      category      TEXT NOT NULL,
      priority      TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'open',
      assignee      TEXT,
      linked_jira   TEXT,                           -- e.g. OFFLINE-1 (engineering issue)
      ai_summary    TEXT,                           -- JSON cached from last summarisation
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_status   ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id);

    -- Append-only audit trail: every change to a ticket becomes an event.
    CREATE TABLE IF NOT EXISTS ticket_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id   TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,                    -- created | status_changed | priority_changed | assigned | jira_linked | comment | ai_summary
      actor       TEXT NOT NULL,
      from_value  TEXT,
      to_value    TEXT,
      body        TEXT,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_ticket ON ticket_events(ticket_id);

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('agent','admin')),
      password_hash TEXT NOT NULL,
      salt          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  TEXT NOT NULL
    );
  `);
}

export function nowIso() {
  return new Date().toISOString();
}

export function nextTicketId(db) {
  const row = db
    .prepare("SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) AS n FROM tickets")
    .get();
  return `SUP-${(row.n || 1000) + 1}`;
}
