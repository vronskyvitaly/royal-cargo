import { Router } from "express";
import pool from "../db.js";

const router = Router();

router.get("/", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      ct.id, ct.lead_id, ct.subject, ct.call_date, ct.manager_name,
      ct.result_type, ct.phone,
      length(ct.transcript_raw) AS transcript_len,
      EXISTS (SELECT 1 FROM articles a WHERE a.transcript_id = ct.id) AS has_article
    FROM call_transcripts ct
    ORDER BY ct.call_date DESC
    LIMIT 100
  `);
  res.json(rows);
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
