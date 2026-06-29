import { Router } from "express";
import type { Server } from "socket.io";
import pool from "../db.js";
import { generateArticle } from "../services/claude.js";
import { publishToMegagroup } from "../services/megagroup.js";
import { publishToWordPress } from "../services/wordpress.js";

export function createArticlesRouter(io: Server) {
  const router = Router();

  // List all articles
  router.get("/", async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT
        a.id, a.title, a.status, a.platform, a.published_url,
        a.review_comment, a.reviewed_by, a.created_at, a.updated_at,
        ct.subject AS transcript_subject, ct.call_date, ct.manager_name,
        a.transcript_id
      FROM articles a
      LEFT JOIN call_transcripts ct ON ct.id = a.transcript_id
      ORDER BY a.updated_at DESC
    `);
    res.json(rows);
  });

  // Get single article
  router.get("/:id", async (req, res) => {
    const { rows } = await pool.query(
      `SELECT a.*, ct.subject AS transcript_subject, ct.call_date, ct.transcript_raw
       FROM articles a
       LEFT JOIN call_transcripts ct ON ct.id = a.transcript_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    return res.json(rows[0]);
  });

  // Generate article from transcript
  router.post("/generate", async (req, res) => {
    const { transcriptId } = req.body as { transcriptId: number };
    if (!transcriptId)
      return res.status(400).json({ error: "transcriptId required" });

    const { rows } = await pool.query(
      "SELECT id, subject, transcript_raw FROM call_transcripts WHERE id = $1",
      [transcriptId]
    );
    const transcript = rows[0];
    if (!transcript) return res.status(404).json({ error: "Transcript not found" });
    if (!transcript.transcript_raw)
      return res.status(400).json({ error: "Transcript has no raw text" });

    try {
      const { title, content } = await generateArticle(
        transcript.transcript_raw as string,
        transcript.subject as string
      );

      const { rows: inserted } = await pool.query(
        `INSERT INTO articles (transcript_id, title, content, status)
         VALUES ($1, $2, $3, 'draft') RETURNING *`,
        [transcriptId, title, content]
      );

      io.emit("article:created", inserted[0]);
      return res.json(inserted[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: String(err) });
    }
  });

  // Update article (edit title/content, approve, reject)
  router.put("/:id", async (req, res) => {
    const { title, content, status, reviewedBy, reviewComment } = req.body as {
      title?: string;
      content?: string;
      status?: string;
      reviewedBy?: string;
      reviewComment?: string;
    };

    const allowed = ["draft", "approved", "rejected"];
    if (status && !allowed.includes(status))
      return res.status(400).json({ error: "Invalid status" });

    const { rows } = await pool.query(
      `UPDATE articles SET
        title = COALESCE($1, title),
        content = COALESCE($2, content),
        status = COALESCE($3, status),
        reviewed_by = COALESCE($4, reviewed_by),
        review_comment = COALESCE($5, review_comment),
        updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [title, content, status, reviewedBy, reviewComment, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });

    io.emit("article:updated", rows[0]);
    return res.json(rows[0]);
  });

  // Publish to WordPress or Megagroup
  router.post("/:id/publish", async (req, res) => {
    const { platform } = req.body as { platform: "wordpress" | "megagroup" };

    const { rows } = await pool.query(
      "SELECT * FROM articles WHERE id = $1",
      [req.params.id]
    );
    const article = rows[0];
    if (!article) return res.status(404).json({ error: "Not found" });
    if (article.status !== "approved")
      return res.status(400).json({ error: "Only approved articles can be published" });

    try {
      let publishedUrl = "";
      if (platform === "wordpress") {
        publishedUrl = await publishToWordPress(
          article.title as string,
          article.content as string
        );
      } else if (platform === "megagroup") {
        publishedUrl = await publishToMegagroup(
          article.title as string,
          article.content as string
        );
      } else {
        return res.status(400).json({ error: "Unknown platform" });
      }

      const { rows: updated } = await pool.query(
        `UPDATE articles SET status = 'published', platform = $1, published_url = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [platform, publishedUrl, req.params.id]
      );

      io.emit("article:published", updated[0]);
      return res.json(updated[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: String(err) });
    }
  });

  // Delete article
  router.delete("/:id", async (req, res) => {
    await pool.query("DELETE FROM articles WHERE id = $1", [req.params.id]);
    io.emit("article:deleted", { id: Number(req.params.id) });
    res.json({ ok: true });
  });

  return router;
}
