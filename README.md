# RouteMart Support Portal: Rapid Prototype

A support portal where distributor partners' issues are logged, triaged and tracked. Each ticket is linked to the engineering issue (Jira) behind it, and an AI layer summarises tickets and spots recurring problems.

Built for the DevRev Solutions Engineer *Rapid Prototype Challenge*. It shares the fictional **RouteMart** storyline with Part 1: the duplicate-order and offline-sync problems customers report here are the same ones tracked in Jira project `OFFLINE` and in the Offline Mode PRD.

## Quick start

Requires Node 20+.

```bash
npm run install:all   # install server + client deps
npm run build         # build the React frontend
npm start             # API + UI on http://localhost:4000
```

Sign in with the demo account (button on the login page). Test credentials are listed in `server/src/seed.js`.

Optional: set `ANTHROPIC_API_KEY` before `npm start` to power AI summaries and insights with Claude (`claude-opus-5-5`). Without a key, a deterministic rules engine produces the same response shape, so the demo always works.

Other commands: `npm test` (API tests), `npm run seed` (reset demo data), `npm run dev:api` + `npm run dev:web` (hot reload on :5173).

## Architecture

```
React (Vite) SPA  ──fetch /api──►  Express API  ──►  SQLite (better-sqlite3)
  list · detail · create · insights       auth · validation · workflow          tickets · customers · events · users
                                          │
                                          └──►  AI service: Claude Messages API (fallback: rules engine)
```

- **Frontend:** React 18 + React Router, plain CSS (light/dark, responsive). The production build is served by Express, so it deploys as one service.
- **Backend:** Node/Express. Every handler validates its input. Errors come back as `{ error, details }` with proper status codes (400/401/404/422).
- **Database:** SQLite file (`server/data/support.db`), created and seeded on first run.

## Data model

| Entity | Key fields | Notes |
|---|---|---|
| **Customer** | id, name, city, tier | Distributor partner (B2B account) |
| **Ticket** | id (`SUP-1001`), title, description, customer_id, reporter_name, channel, category, priority, status, assignee, **linked_jira**, ai_summary, created_at, updated_at | `linked_jira` connects Support to Engineering |
| **TicketEvent** | ticket_id, type, actor, from_value, to_value, body, created_at | Append-only audit trail: status changes, assignments, notes, AI summaries |
| **User / Session** | email, name, role · token, expires_at | scrypt-hashed passwords, bearer-token sessions |

**Status workflow** (enforced by the server; an invalid move returns `422`):
`open → in_progress → waiting_on_customer → resolved → closed`, with reopen allowed from `resolved` / `closed`.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Sign in, returns a bearer token |
| GET | `/api/tickets` | List. Filters: `status`, `priority`, `category`, `customer_id`, `q`; `sort=priority` |
| GET | `/api/tickets/:id` | Detail + activity + allowed next statuses |
| POST | `/api/tickets` | Create (validated) |
| PUT | `/api/tickets/:id` | Update status / priority / assignee / Jira link / add a note |
| POST | `/api/tickets/:id/summary` | ✦ AI summary, impact, next action, suggested priority, sentiment |
| GET | `/api/insights` | ✦ Recurring issues clustered by Jira issue, with AI narrative and customer at risk |
| GET | `/api/stats`, `/api/customers`, `/api/meta` | Dashboard counts, customers, enums |

(`/api/tickets` is the "records" resource from the brief: `GET /records`, `GET /records/:id`, `POST /records`, `PUT /records/:id`.)

## How DevRev / AI could use this data

- **AI ticket analysis:** summarise, score sentiment and suggest priority at intake. This is in the prototype.
- **Recurring bugs for Product:** clusters show that 4 tickets from 3 distributors trace to `OFFLINE-1`, and a new unlinked ticket is flagged as *likely OFFLINE-1*. This is in the prototype.
- **Customer-at-risk signal:** open ticket weight per account highlights Shree Balaji Distributors. This is in the prototype.
- **With DevRev:** tickets would sync into DevRev as tickets linked to issues. Computer could then answer "which customers are affected by OFFLINE-1?" across Support, Jira and PRDs, which is exactly the Part 1 demo.
