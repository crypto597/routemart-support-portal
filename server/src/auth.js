import crypto from "node:crypto";

const SESSION_HOURS = 12;

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.password_hash, "hex"));
}

export function login(db, email, password) {
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email || "").toLowerCase());
  if (!user || !verifyPassword(String(password || ""), user)) return null;
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, user.id, expires);
  return { token, user: publicUser(user) };
}

export function logout(db, token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

// Express middleware: requires "Authorization: Bearer <token>".
export function requireAuth(db) {
  return (req, res, next) => {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const row = db
      .prepare(
        `SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
      )
      .get(token);
    if (!row || row.expires_at < new Date().toISOString()) {
      return res.status(401).json({ error: "Session expired, please sign in again" });
    }
    req.user = publicUser(row);
    req.token = token;
    next();
  };
}
