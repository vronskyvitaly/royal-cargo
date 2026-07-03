import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { getSetting } from "../services/settings.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { email, password, appSecret } = req.body as {
    email: string; password: string; appSecret: string;
  };
  if (!email || !password || !appSecret) {
    res.status(400).json({ error: "Все поля обязательны" });
    return;
  }
  const storedSecret = await getSetting("app_secret") ?? process.env.APP_SECRET;
  if (appSecret !== storedSecret) {
    res.status(401).json({ error: "Неверный код доступа к приложению" });
    return;
  }

  const { rows } = await pool.query(
    "SELECT id, email, name, role, password_hash FROM users WHERE email = $1",
    [email.toLowerCase().trim()]
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash as string))) {
    res.status(401).json({ error: "Неверный email или пароль" });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: "30d" }
  );

  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

export default router;
