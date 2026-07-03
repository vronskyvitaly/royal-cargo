import bcrypt from "bcryptjs";
import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function requireAdmin(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Только для администраторов" });
    return;
  }
  next();
}

// Список пользователей
router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, email, name, role, position, created_at FROM users ORDER BY created_at"
  );
  res.json(rows);
});

// Создать пользователя
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const { email, name, password, role } = req.body as {
    email: string; name: string; password: string; role: string;
  };
  if (!email || !name || !password) {
    res.status(400).json({ error: "Email, имя и пароль обязательны" });
    return;
  }
  if (!["admin", "editor"].includes(role)) {
    res.status(400).json({ error: "Роль: admin или editor" });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, created_at`,
      [email.toLowerCase().trim(), name.trim(), hash, role]
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

// Удалить пользователя
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  if (Number(req.params.id) === req.user!.userId) {
    res.status(400).json({ error: "Нельзя удалить себя" });
    return;
  }
  await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

// Обновить должность (admin для всех, сам пользователь для себя)
router.put("/:id/position", requireAuth, async (req, res) => {
  const targetId = Number(req.params.id);
  if (req.user!.role !== "admin" && req.user!.userId !== targetId) {
    res.status(403).json({ error: "Нет доступа" });
    return;
  }
  const { position } = req.body as { position: string };
  const { rows } = await pool.query(
    "UPDATE users SET position = $1 WHERE id = $2 RETURNING id, email, name, role, position, created_at",
    [position?.trim() || null, targetId]
  );
  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(rows[0]);
});

// Сменить роль
router.put("/:id/role", requireAuth, requireAdmin, async (req, res) => {
  if (Number(req.params.id) === req.user!.userId) {
    res.status(400).json({ error: "Нельзя изменить свою роль" });
    return;
  }
  const { role } = req.body as { role: string };
  if (!["admin", "editor"].includes(role)) {
    res.status(400).json({ error: "Роль: admin или editor" });
    return;
  }
  const { rows } = await pool.query(
    "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, name, role, created_at",
    [role, req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
  res.json(rows[0]);
});

// Сбросить пароль
router.put("/:id/password", requireAuth, requireAdmin, async (req, res) => {
  const { password } = req.body as { password: string };
  if (!password || password.length < 6) {
    res.status(400).json({ error: "Минимум 6 символов" });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.params.id]);
  res.json({ ok: true });
});

export default router;
