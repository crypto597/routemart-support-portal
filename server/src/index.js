import { openDb } from "./db.js";
import { seed } from "./seed.js";
import { createApp } from "./app.js";
import { aiStatus } from "./ai.js";

const PORT = Number(process.env.PORT || 4000);

const db = openDb();
if (seed(db)) console.log("Database was empty: seeded demo data");

createApp(db).listen(PORT, () => {
  const ai = aiStatus();
  console.log(`RouteMart Support API listening on http://localhost:${PORT}`);
  console.log(ai.enabled ? `AI features: Claude (${ai.model})` : "AI features: rules engine (set ANTHROPIC_API_KEY to use Claude)");
});
