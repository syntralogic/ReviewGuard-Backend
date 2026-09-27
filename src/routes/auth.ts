import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db";
import { clearSessionCookie, requireAuth, setSessionCookie, signToken } from "../middleware/auth";

const router = Router();

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address."),
  password: z.string().min(1, "Password is required"),
});

router.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
  }
  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const client = await pool.connect();
  try {
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.rowCount) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await client.query("BEGIN");
    const userResult = await client.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role",
      [name, normalizedEmail, passwordHash],
    );
    const user = userResult.rows[0];

    // Every account gets a default business, matching the single
    // "demo-business" the frontend mock previously assumed.
    const businessResult = await client.query(
      "INSERT INTO businesses (owner_id, name) VALUES ($1, $2) RETURNING id",
      [user.id, `${name}'s Business`],
    );
    const businessId = businessResult.rows[0].id;

    await client.query(
      "INSERT INTO google_connections (business_id, connected) VALUES ($1, false)",
      [businessId],
    );
    await client.query("COMMIT");

    const token = signToken({ userId: user.id, businessId });
    setSessionCookie(res, token);

    return res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    await client.query("ROLLBACK");
    // eslint-disable-next-line no-console
    console.error("Signup failed:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  } finally {
    client.release();
  }
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
  }
  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  try {
    const userResult = await pool.query(
      "SELECT id, name, email, password_hash, role FROM users WHERE email = $1",
      [normalizedEmail],
    );
    const user = userResult.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const businessResult = await pool.query(
      "SELECT id FROM businesses WHERE owner_id = $1 ORDER BY created_at ASC LIMIT 1",
      [user.id],
    );
    const businessId = businessResult.rows[0]?.id;
    if (!businessId) {
      return res.status(500).json({ error: "No business found for this account." });
    }

    const token = signToken({ userId: user.id, businessId });
    setSessionCookie(res, token);

    return res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Login failed:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  return res.status(204).send();
});

router.get("/me", requireAuth, async (req, res) => {
  const userResult = await pool.query("SELECT id, name, email, role FROM users WHERE id = $1", [
    req.auth!.userId,
  ]);
  const user = userResult.rows[0];
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  return res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

export default router;
