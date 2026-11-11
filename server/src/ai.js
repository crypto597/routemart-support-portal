// AI features: ticket summarisation and recurring-issue insights.
// Uses Claude when credentials are configured (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN),
// otherwise falls back to a deterministic rules engine so the demo always works.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

async function askClaude(system, prompt) {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") throw new Error("Model declined the request");
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return parseJson(text);
}

function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI response was not JSON");
  return JSON.parse(text.slice(start, end + 1));
}

// ---------------------------------------------------------------- Summaries

const SUMMARY_SYSTEM = `You are a support operations assistant for RouteMart, a B2B distribution company whose field reps take orders on a mobile app.
Summarise a support ticket for a busy support lead. Respond with JSON only, matching:
{"summary": string (max 2 sentences), "customer_impact": string (1 sentence), "suggested_priority": "low"|"medium"|"high"|"urgent", "next_action": string (1 sentence, concrete), "sentiment": "calm"|"frustrated"|"angry"}`;

export async function summariseTicket(ticket, events, relatedCount) {
  if (aiEnabled()) {
    try {
      const prompt = JSON.stringify({ ticket, history: events.slice(-15), similar_open_tickets: relatedCount });
      const result = await askClaude(SUMMARY_SYSTEM, prompt);
      return { ...result, source: "claude", model: MODEL };
    } catch (err) {
      console.warn("Claude summary failed, using rules:", err.message);
    }
  }
  return { ...rulesSummary(ticket, relatedCount), source: "rules" };
}

const ANGRY_WORDS = ["again", "urgent", "escalat", "embarrass", "costing", "refuse", "fourth week", "more often"];

function rulesSummary(t, relatedCount) {
  const text = `${t.title} ${t.description}`.toLowerCase();
  const angerHits = ANGRY_WORDS.filter((w) => text.includes(w)).length;
  const sentiment = angerHits >= 2 ? "angry" : angerHits === 1 ? "frustrated" : "calm";
  const firstSentence = t.description.split(/(?<=[.!?])\s/)[0];
  let suggested = t.priority;
  if (t.category === "duplicate-order" || (relatedCount >= 3 && t.priority !== "urgent")) suggested = "urgent";
  const impact = {
    "duplicate-order": "Duplicate shipments create reverse-logistics cost and erode retailer trust.",
    sync: "Orders are delayed or lost, so they miss dispatch windows.",
    pricing: "Price mismatches cause invoice disputes and delayed payments.",
    crash: "Reps lose work and fall back to paper orders.",
    performance: "Reps waste time at the start of each beat.",
    account: "A rep is blocked from taking orders.",
    "feature-request": "Customer is asking for capability we don't offer yet.",
  }[t.category] || "Customer workflow is disrupted.";
  const next = t.linked_jira
    ? `Share the status of ${t.linked_jira} with ${t.customer_name} and set a follow-up date.`
    : `Triage with engineering and link a Jira issue for this ${t.category} problem.`;
  return {
    summary: `${t.customer_name}: ${firstSentence}`,
    customer_impact: impact,
    suggested_priority: suggested,
    next_action: next,
    sentiment,
  };
}

// ---------------------------------------------------------------- Insights

// Deterministic clustering is always computed (it's cheap and auditable);
// Claude adds a narrative on top when available.
export function clusterTickets(tickets) {
  const groups = new Map();
  for (const t of tickets) {
    const key = t.linked_jira || `unlinked:${t.category}`;
    if (!groups.has(key)) {
      groups.set(key, { key, linked_jira: t.linked_jira, category: t.category, tickets: [], customers: new Set() });
    }
    const g = groups.get(key);
    g.tickets.push({ id: t.id, title: t.title, status: t.status, priority: t.priority });
    g.customers.add(t.customer_name);
  }
  // For tickets not yet linked to Jira, suggest the issue most other tickets in the same category link to.
  const jiraByCategory = {};
  for (const t of tickets) {
    if (!t.linked_jira) continue;
    const counts = (jiraByCategory[t.category] ||= {});
    counts[t.linked_jira] = (counts[t.linked_jira] || 0) + 1;
  }
  const suggestJira = (category) => {
    const counts = jiraByCategory[category];
    if (!counts) return null;
    const [key, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return n >= 2 ? { key, similar_tickets: n } : null;
  };
  const weight = { urgent: 4, high: 3, medium: 2, low: 1 };
  return [...groups.values()]
    .map((g) => ({
      linked_jira: g.linked_jira,
      suggested_jira: g.linked_jira ? null : suggestJira(g.category),
      category: g.category,
      ticket_count: g.tickets.length,
      open_count: g.tickets.filter((t) => !["resolved", "closed"].includes(t.status)).length,
      customers: [...g.customers],
      score: g.tickets.reduce((s, t) => s + weight[t.priority], 0) * g.customers.size,
      tickets: g.tickets,
    }))
    .sort((a, b) => b.score - a.score);
}

const INSIGHTS_SYSTEM = `You are an AI analyst that helps Support and Product teams at RouteMart (a B2B distribution company with a field sales app) spot recurring problems.
You get clusters of support tickets grouped by linked engineering (Jira) issue. Respond with JSON only, matching:
{"headline": string (1 sentence), "themes": [{"title": string, "why_it_matters": string, "evidence": string, "recommended_owner": "Support"|"Product"|"Engineering", "recommendation": string}] (3-4 items, most important first), "customer_at_risk": string|null}`;

export async function generateInsights(tickets) {
  const clusters = clusterTickets(tickets);
  let narrative = null;
  let source = "rules";
  if (aiEnabled()) {
    try {
      narrative = await askClaude(INSIGHTS_SYSTEM, JSON.stringify(clusters.slice(0, 10)));
      source = "claude";
    } catch (err) {
      console.warn("Claude insights failed, using rules:", err.message);
    }
  }
  if (!narrative) narrative = rulesNarrative(clusters, tickets);
  return { source, model: source === "claude" ? MODEL : null, narrative, clusters };
}

function rulesNarrative(clusters, tickets) {
  const top = clusters.slice(0, 3);
  const byCustomer = {};
  for (const t of tickets) {
    if (["resolved", "closed"].includes(t.status)) continue;
    const w = { urgent: 4, high: 3, medium: 2, low: 1 }[t.priority];
    byCustomer[t.customer_name] = (byCustomer[t.customer_name] || 0) + w;
  }
  const atRisk = Object.entries(byCustomer).sort((a, b) => b[1] - a[1])[0];
  return {
    headline: top.length
      ? `${top[0].ticket_count} tickets from ${top[0].customers.length} customers trace back to ${top[0].linked_jira || top[0].category}, the top recurring issue.`
      : "No recurring issues found.",
    themes: top.map((c) => ({
      title: c.linked_jira ? `${c.category} → ${c.linked_jira}` : `${c.category} (no Jira link yet)`,
      why_it_matters: `${c.open_count} open of ${c.ticket_count} tickets across ${c.customers.length} customer(s).`,
      evidence: c.tickets.map((t) => t.id).join(", "),
      recommended_owner: c.linked_jira ? "Engineering" : "Product",
      recommendation: c.linked_jira
        ? `Prioritise ${c.linked_jira}; customers affected: ${c.customers.join(", ")}.`
        : c.suggested_jira
          ? `Likely a repeat of ${c.suggested_jira.key} (${c.suggested_jira.similar_tickets} similar tickets link there). Link it so engineering sees the full impact.`
          : "Create a Jira issue and add it to the roadmap review.",
    })),
    customer_at_risk: atRisk ? atRisk[0] : null,
  };
}

export function aiStatus() {
  return { enabled: aiEnabled(), model: aiEnabled() ? MODEL : null };
}
