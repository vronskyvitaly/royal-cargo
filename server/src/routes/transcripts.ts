import { Router } from "express";
import pool from "../db.js";

const router = Router();

router.get("/managers", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT DISTINCT manager_name
    FROM call_transcripts
    WHERE manager_name IS NOT NULL
      AND manager_name <> ''
      AND manager_name <> 'Неизвестен'
    ORDER BY manager_name
  `);
  res.json(rows.map((r: { manager_name: string }) => r.manager_name));
});

router.get("/", async (req, res) => {
  const { page = "1", limit = "25", search, result, has_article, manager } = req.query;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 25));
  const offset = (pageNum - 1) * limitNum;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`(ct.subject ILIKE $${idx} OR ct.phone ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (result && result !== "all") {
    conditions.push(`ct.result_type = $${idx}`);
    params.push(result);
    idx++;
  }
  if (manager && manager !== "all") {
    conditions.push(`ct.manager_name = $${idx}`);
    params.push(manager);
    idx++;
  }
  if (has_article === "yes") {
    conditions.push(`EXISTS (SELECT 1 FROM articles a WHERE a.transcript_id = ct.id)`);
  } else if (has_article === "no") {
    conditions.push(`NOT EXISTS (SELECT 1 FROM articles a WHERE a.transcript_id = ct.id)`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRes = await pool.query(
    `SELECT COUNT(*) FROM call_transcripts ct ${where}`,
    params
  );
  const total = parseInt((countRes.rows[0] as { count: string }).count);

  const dataParams = [...params, limitNum, offset];
  const { rows } = await pool.query(`
    SELECT
      ct.id, ct.lead_id, ct.subject, ct.call_date, ct.manager_name,
      ct.result_type, ct.phone,
      length(ct.transcript_raw) AS transcript_len,
      EXISTS (SELECT 1 FROM articles a WHERE a.transcript_id = ct.id) AS has_article
    FROM call_transcripts ct
    ${where}
    ORDER BY ct.call_date DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `, dataParams);

  res.json({ rows, total, page: pageNum, limit: limitNum });
});

router.get("/:id", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, lead_id, lead_url, subject, call_date, manager_name,
            result_type, phone, transcript_raw, summary
     FROM call_transcripts WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  return res.json(rows[0]);
});

export default router;
