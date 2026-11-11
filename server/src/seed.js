// Seed data for the RouteMart Support Portal demo.
// Ticket IDs and Jira keys line up with the Part 1 sample data (Jira project OFFLINE).
//
// Demo login (test-only credentials for this local prototype):
//   agent@routemart.test / demo1234   (role: agent)
//   admin@routemart.test / demo1234   (role: admin)
import { openDb } from "./db.js";
import { hashPassword } from "./auth.js";
import { fileURLToPath } from "node:url";

export const DEMO_USERS = [
  { email: "agent@routemart.test", name: "Ananya Rao", role: "agent", password: "demo1234" },
  { email: "admin@routemart.test", name: "Neha Kulkarni", role: "admin", password: "demo1234" },
];

const customers = [
  ["CUS-001", "Shree Balaji Distributors", "Nashik", "tier-1"],
  ["CUS-002", "Om Sai Traders", "Pune", "tier-2"],
  ["CUS-003", "Patil Agencies", "Kolhapur", "tier-2"],
  ["CUS-004", "Krishna Wholesale", "Indore", "tier-1"],
  ["CUS-005", "Annapurna Distributors", "Lucknow", "tier-2"],
];

// [id, title, description, customer, reporter, channel, category, priority, status, assignee, jira, daysAgo]
const tickets = [
  ["SUP-1001", "Same order delivered twice to Ganesh Kirana, Igatpuri",
    "Our warehouse shipped order RM-55120 and RM-55121 to the same store with identical items. Salesman says he pressed submit only once when network was weak. Retailer refused second delivery.",
    "CUS-001", "Vikram Deshpande", "phone", "duplicate-order", "urgent", "in_progress", "Ananya Rao", "OFFLINE-1", 24],
  ["SUP-1002", "App closes by itself when network comes back",
    "Multiple reps report that the app crashes the moment mobile data reconnects, while the order is being submitted. Happens on Samsung and Vivo phones.",
    "CUS-002", "Sameer Joshi", "app", "crash", "high", "open", null, "OFFLINE-2", 21],
  ["SUP-1003", "Invoice amount higher than what salesman showed",
    "Salesman showed ₹12,400 on the app but invoice came for ₹12,950. Store owner is disputing the invoice and refusing to pay the difference.",
    "CUS-001", "Vikram Deshpande", "whatsapp", "pricing", "medium", "resolved", "Ananya Rao", "OFFLINE-7", 20],
  ["SUP-1004", "Duplicate order for Sai Medical — two deliveries",
    "Two identical orders created within one minute for Sai Medical. Network was patchy in the market. We had to cancel one manually after it was already dispatched.",
    "CUS-002", "Sameer Joshi", "email", "duplicate-order", "high", "open", null, "OFFLINE-1", 18],
  ["SUP-1005", "Rep cannot log in after phone update",
    "After Android update, rep REP-2231 gets 'invalid session' on login. Reinstalling fixed it.",
    "CUS-003", "Anil Patil", "phone", "account", "low", "closed", "Ananya Rao", null, 17],
  ["SUP-1006", "App hangs for 20 seconds every morning",
    "When reps open the app in the morning it freezes for 15-20 seconds while 'Updating catalog'. Mostly on cheaper phones (Redmi 9A).",
    "CUS-004", "Rakesh Agrawal", "email", "performance", "medium", "open", null, "OFFLINE-5", 15],
  ["SUP-1007", "Orders stuck on 'Syncing' at end of day",
    "3-4 reps every day have orders stuck in 'Syncing' after working in no-network areas all day. Only fix is logout/login which deletes the orders. Orders miss next-day dispatch.",
    "CUS-001", "Vikram Deshpande", "phone", "sync", "high", "waiting_on_customer", "Ananya Rao", "OFFLINE-8", 13],
  ["SUP-1008", "Scheme discount missing on order",
    "New 'buy 10 get 1' scheme on Tata Salt was live from 11am but the rep's app did not apply it. Retailer was promised the free goods.",
    "CUS-005", "Pooja Srivastava", "whatsapp", "pricing", "medium", "open", null, "OFFLINE-11", 11],
  ["SUP-1009", "3 duplicate orders in Trimbak belt this week",
    "Again duplicates — 3 stores in Trimbak got double deliveries this week. This is the fourth week in a row. Owner has asked for escalation to RouteMart leadership.",
    "CUS-001", "Vikram Deshpande", "phone", "duplicate-order", "urgent", "open", null, "OFFLINE-1", 9],
  ["SUP-1010", "Order rejected after rep left the store — credit limit",
    "Order taken offline at New Bharat Stores was rejected 4 hours later for credit limit exceeded. Rep had already promised delivery. Very embarrassing for our team.",
    "CUS-004", "Rakesh Agrawal", "email", "sync", "high", "open", null, "OFFLINE-16", 8],
  ["SUP-1011", "Orders not syncing on Redmi phones until app is opened",
    "On Xiaomi/Redmi phones, orders saved offline only sync when the rep opens the app again, sometimes next morning.",
    "CUS-005", "Pooja Srivastava", "app", "sync", "medium", "in_progress", "Ananya Rao", "OFFLINE-12", 7],
  ["SUP-1012", "Retailer received double shipment",
    "Shiv Shakti Provision received two shipments of the same order. Second one returned at our cost. Please fix urgently, we are seeing this more often.",
    "CUS-003", "Anil Patil", "email", "duplicate-order", "high", "open", null, "OFFLINE-1", 5],
  ["SUP-1013", "Need report of unsynced orders for supervisors",
    "Our area managers want a daily list of orders that are still on reps' phones and not synced, so they can follow up before dispatch cut-off.",
    "CUS-002", "Sameer Joshi", "email", "feature-request", "low", "open", null, "OFFLINE-20", 4],
  ["SUP-1014", "Lost order after app was killed",
    "Rep took a 30-line order, phone killed the app, order was gone. Re-entered from memory.",
    "CUS-003", "Anil Patil", "phone", "sync", "high", "closed", "Ananya Rao", "OFFLINE-9", 30],
  ["SUP-1015", "Need offline order taking in hill areas",
    "Our reps in the Ghats have no network for most of the beat. Please allow taking orders fully offline and syncing later.",
    "CUS-005", "Pooja Srivastava", "email", "feature-request", "medium", "open", null, null, 3],
  ["SUP-1016", "Supervisor's quantity change got overwritten",
    "Area manager reduced quantity on the web console, but when the rep's phone synced the original quantity came back and was shipped.",
    "CUS-004", "Rakesh Agrawal", "email", "sync", "medium", "open", null, "OFFLINE-3", 2],
];

export function seed(db, { reset = false } = {}) {
  if (reset) {
    db.exec("DELETE FROM ticket_events; DELETE FROM tickets; DELETE FROM sessions; DELETE FROM users; DELETE FROM customers;");
  }
  const hasData = db.prepare("SELECT COUNT(*) AS n FROM tickets").get().n > 0;
  if (hasData) return false;

  const insertCustomer = db.prepare("INSERT INTO customers (id, name, city, tier) VALUES (?, ?, ?, ?)");
  const insertUser = db.prepare(
    "INSERT INTO users (email, name, role, password_hash, salt) VALUES (?, ?, ?, ?, ?)"
  );
  const insertTicket = db.prepare(`
    INSERT INTO tickets (id, title, description, customer_id, reporter_name, channel, category,
                         priority, status, assignee, linked_jira, created_at, updated_at)
    VALUES (@id, @title, @description, @customer_id, @reporter_name, @channel, @category,
            @priority, @status, @assignee, @linked_jira, @created_at, @updated_at)`);
  const insertEvent = db.prepare(`
    INSERT INTO ticket_events (ticket_id, type, actor, from_value, to_value, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);

  const tx = db.transaction(() => {
    for (const c of customers) insertCustomer.run(...c);
    for (const u of DEMO_USERS) {
      const { hash, salt } = hashPassword(u.password);
      insertUser.run(u.email, u.name, u.role, hash, salt);
    }
    for (const t of tickets) {
      const [id, title, description, customer_id, reporter_name, channel, category, priority, status, assignee, linked_jira, daysAgo] = t;
      const created = new Date(Date.now() - daysAgo * 86400000);
      const updated = new Date(created.getTime() + Math.min(daysAgo, 2) * 3600000 * 6);
      insertTicket.run({
        id, title, description, customer_id, reporter_name, channel, category, priority, status,
        assignee, linked_jira, created_at: created.toISOString(), updated_at: updated.toISOString(),
      });
      insertEvent.run(id, "created", reporter_name, null, "open", null, created.toISOString());
      if (linked_jira) insertEvent.run(id, "jira_linked", "Ananya Rao", null, linked_jira, null, updated.toISOString());
      if (status !== "open") insertEvent.run(id, "status_changed", assignee || "Ananya Rao", "open", status, null, updated.toISOString());
    }
  });
  tx();
  return true;
}

// `npm run seed` → reset and reseed
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb();
  seed(db, { reset: process.argv.includes("--reset") });
  console.log("Seeded", db.prepare("SELECT COUNT(*) n FROM tickets").get().n, "tickets");
}
