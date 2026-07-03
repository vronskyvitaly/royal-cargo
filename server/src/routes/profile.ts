import bcrypt from "bcryptjs";
import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { getSetting, setSetting } from "../services/settings.js";

const SUPER_ADMIN = "vronskyvitaly@mail.ru";

const router = Router();
router.use(requireAuth);

// Получить свой профиль
router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, email, name, role, position, created_at FROM users WHERE id = $1",
    [req.user!.userId]
  );
  res.json(rows[0] ?? null);
});

// Обновить имя и должность (все пользователи)
router.put("/", async (req, res) => {
  const { name, position } = req.body as { name?: string; position?: string };
  const { rows } = await pool.query(
    `UPDATE users SET
       name     = COALESCE(NULLIF($1, ''), name),
       position = COALESCE($2, position)
     WHERE id = $3
     RETURNING id, email, name, role, position`,
    [name?.trim(), position ?? null, req.user!.userId]
  );
  res.json(rows[0]);
});

// Сменить свой пароль
router.put("/password", async (req, res) => {
  const { current, next } = req.body as { current: string; next: string };
  if (!current || !next || next.length < 6) {
    res.status(400).json({ error: "Текущий пароль и новый (мин. 6 симв.) обязательны" });
    return;
  }
  const { rows } = await pool.query(
    "SELECT password_hash FROM users WHERE id = $1",
    [req.user!.userId]
  );
  if (!(await bcrypt.compare(current, rows[0].password_hash as string))) {
    res.status(401).json({ error: "Неверный текущий пароль" });
    return;
  }
  const hash = await bcrypt.hash(next, 10);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.user!.userId]);
  res.json({ ok: true });
});

// Обновить роль/должность сотрудника (только admin)
router.put("/users/:id", async (req, res) => {
  if (req.user!.role !== "admin") {
    res.status(403).json({ error: "Только для администраторов" });
    return;
  }
  const { role, position } = req.body as { role?: string; position?: string };
  if (role && !["admin", "editor"].includes(role)) {
    res.status(400).json({ error: "Роль: admin или editor" });
    return;
  }
  const { rows } = await pool.query(
    `UPDATE users SET
       role     = COALESCE($1, role),
       position = COALESCE($2, position)
     WHERE id = $3
     RETURNING id, email, name, role, position`,
    [role ?? null, position ?? null, req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: "Не найден" }); return; }
  res.json(rows[0]);
});

// Сменить код доступа к приложению (только super admin)
router.put("/app-secret", async (req, res) => {
  if (req.user!.email !== SUPER_ADMIN) {
    res.status(403).json({ error: "Только для главного администратора" });
    return;
  }
  const { secret } = req.body as { secret: string };
  if (!secret || secret.length < 6) {
    res.status(400).json({ error: "Минимум 6 символов" });
    return;
  }
  await setSetting("app_secret", secret);
  res.json({ ok: true });
});

// Получить список всех сотрудников (только admin)
router.get("/users", async (req, res) => {
  if (req.user!.role !== "admin") {
    res.status(403).json({ error: "Только для администраторов" });
    return;
  }
  const { rows } = await pool.query(
    "SELECT id, email, name, role, position, created_at FROM users ORDER BY name"
  );
  res.json(rows);
});

export default router;
