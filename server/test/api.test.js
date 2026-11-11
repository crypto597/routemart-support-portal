import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { seed, DEMO_USERS } from "../src/seed.js";
import { createApp } from "../src/app.js";

delete process.env.ANTHROPIC_API_KEY; // tests use the deterministic rules engine
delete process.env.ANTHROPIC_AUTH_TOKEN;

let server, base, token;

async function api(method, path, body, auth = true) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(auth && token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

before(async () => {
  const db = openDb(":memory:");
  seed(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test("rejects unauthenticated requests", async () => {
  const r = await api("GET", "/api/tickets", null, false);
  assert.equal(r.status, 401);
});

test("rejects wrong password", async () => {
  const r = await api("POST", "/api/auth/login", { email: DEMO_USERS[0].email, password: "nope" }, false);
  assert.equal(r.status, 401);
});

test("logs in", async () => {
  const r = await api("POST", "/api/auth/login", { email: DEMO_USERS[0].email, password: DEMO_USERS[0].password }, false);
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
  token = r.body.token;
});

test("GET /api/tickets lists seeded tickets and filters", async () => {
  const all = await api("GET", "/api/tickets");
  assert.equal(all.status, 200);
  assert.equal(all.body.length, 16);
  const dup = await api("GET", "/api/tickets?category=duplicate-order");
  assert.ok(dup.body.every((t) => t.category === "duplicate-order"));
  assert.equal(dup.body.length, 4);
  const bad = await api("GET", "/api/tickets?status=bogus");
  assert.equal(bad.status, 400);
});

test("GET /api/tickets/:id returns detail with events and transitions", async () => {
  const r = await api("GET", "/api/tickets/SUP-1001");
  assert.equal(r.status, 200);
  assert.equal(r.body.customer_name, "Shree Balaji Distributors");
  assert.ok(r.body.events.length >= 1);
  assert.deepEqual(r.body.allowed_transitions, ["open", "waiting_on_customer", "resolved"]);
  assert.equal((await api("GET", "/api/tickets/SUP-9999")).status, 404);
});

test("POST /api/tickets validates and creates", async () => {
  const bad = await api("POST", "/api/tickets", { title: "x", customer_id: "CUS-404" });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.details.title && bad.body.details.customer_id);

  const r = await api("POST", "/api/tickets", {
    title: "Duplicate order at Laxmi Stores",
    description: "Two identical orders were created after the network dropped.",
    customer_id: "CUS-002",
    category: "duplicate-order",
    priority: "high",
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.id, "SUP-1017");
  assert.equal(r.body.status, "open");
});

test("PUT /api/tickets/:id enforces workflow and records events", async () => {
  const ok = await api("PUT", "/api/tickets/SUP-1017", { status: "in_progress", assignee: "Ananya Rao", comment: "Looking into it" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, "in_progress");
  const types = ok.body.events.map((e) => e.type);
  assert.ok(types.includes("status_changed") && types.includes("assigned") && types.includes("comment"));

  const closedTicket = await api("PUT", "/api/tickets/SUP-1005", { status: "resolved" }); // closed -> resolved not allowed
  assert.equal(closedTicket.status, 422);
  assert.deepEqual(closedTicket.body.details.allowed, ["open"]);

  const badJira = await api("PUT", "/api/tickets/SUP-1017", { linked_jira: "not a key" });
  assert.equal(badJira.status, 400);
  const empty = await api("PUT", "/api/tickets/SUP-1017", {});
  assert.equal(empty.status, 400);
});

test("AI summary works without an API key (rules fallback)", async () => {
  const r = await api("POST", "/api/tickets/SUP-1009/summary");
  assert.equal(r.status, 200);
  assert.equal(r.body.source, "rules");
  assert.equal(r.body.suggested_priority, "urgent");
  const detail = await api("GET", "/api/tickets/SUP-1009");
  assert.equal(detail.body.ai_summary.source, "rules");
});

test("insights cluster tickets by linked Jira issue", async () => {
  const r = await api("GET", "/api/insights");
  assert.equal(r.status, 200);
  assert.equal(r.body.clusters[0].linked_jira, "OFFLINE-1");
  assert.ok(r.body.clusters[0].customers.length >= 3);
  assert.ok(r.body.narrative.headline);
});

test("stats endpoint", async () => {
  const r = await api("GET", "/api/stats");
  assert.equal(r.body.total, 17);
});
