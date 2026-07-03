import bcrypt from "bcryptjs";
import { Router } from "express";
import pool from "../db.js";
import { getSetting } from "../services/settings.js";

const router = Router();

router.post("/", async (req, res) => {
  const { name, email, password, appSecret } = req.body as {
    name: string; email: string; password: string; appSecret: string;
  };

  if (!name || !email || !password || !appSecret) {
    res.status(400).json({ error: "Все поля обязательны" });
    return;
  }
  const storedSecret = await getSetting("app_secret") ?? process.env.APP_SECRET;
  if (appSecret !== storedSecret) {
    res.status(401).json({ error: "Неверный код доступа к приложению" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Пароль минимум 6 символов" });
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, 'editor')
       RETURNING id, email, name, role`,
      [email.toLowerCase().trim(), name.trim(), hash]
    );
    res.json(rows[0]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique")) {
      res.status(409).json({ error: "Пользователь с таким email уже существует" });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

export default router;
