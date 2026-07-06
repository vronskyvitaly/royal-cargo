import { Router } from "express";
import type { Server } from "socket.io";
import pool from "../db.js";
import { generateArticle } from "../services/claude.js";
import { publishToMegagroup } from "../services/megagroup.js";
import { publishToWordPress } from "../services/wordpress.js";

async function addHistory(articleId: number, userName: string, action: string) {
  await pool.query(
    "INSERT INTO article_history (article_id, user_name, action) VALUES ($1, $2, $3)",
    [articleId, userName, action]
  );
}

export function createArticlesRouter(io: Server) {
  const router = Router();

  // List all articles
  router.get("/", async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT
        a.id, a.title, a.status, a.platform, a.published_url,
        a.review_comment, a.reviewed_by, a.last_edited_by, a.created_at, a.updated_at,
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
    const { rows: history } = await pool.query(
      "SELECT id, user_name, action, created_at FROM article_history WHERE article_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );
    return res.json({ ...rows[0], history });
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

    const userName = req.user!.name;

    // Respond immediately — generation runs in background to avoid proxy timeout
    res.status(202).json({ message: "Генерация запущена" });

    (async () => {
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
        await addHistory(inserted[0].id as number, userName, "Создал черновик");
        io.emit("article:created", inserted[0]);
      } catch (err) {
        console.error("Article generation error:", err);
        io.emit("article:generate_error", { transcriptId, error: String(err) });
      }
    })();
  });

  // Update article (edit title/content, approve, reject)
  router.put("/:id", async (req, res) => {
    const { title, content, status, reviewComment } = req.body as {
      title?: string;
      content?: string;
      status?: string;
      reviewComment?: string;
    };

    const allowed = ["draft", "approved", "rejected"];
    if (status && !allowed.includes(status))
      return res.status(400).json({ error: "Invalid status" });

    const actor = req.user!.name;
    const editingContent = title !== undefined || content !== undefined;
    const lastEditedBy = editingContent ? actor : undefined;
    const reviewedBy = (status === "approved" || status === "rejected") ? actor : undefined;

    const { rows } = await pool.query(
      `UPDATE articles SET
        title = COALESCE($1, title),
        content = COALESCE($2, content),
        status = COALESCE($3, status),
        reviewed_by = COALESCE($4, reviewed_by),
        review_comment = COALESCE($5, review_comment),
        last_edited_by = COALESCE($6, last_edited_by),
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [title, content, status, reviewedBy, reviewComment, lastEditedBy, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });

    const articleId = rows[0].id as number;
    if (status === "approved") {
      await addHistory(articleId, actor, "Одобрил статью");
    } else if (status === "rejected") {
      const comment = reviewComment ? ` — «${reviewComment}»` : "";
      await addHistory(articleId, actor, `Отклонил статью${comment}`);
    } else if (status === "draft") {
      const comment = reviewComment ? ` — «${reviewComment}»` : "";
      await addHistory(articleId, actor, `Вернул на доработку${comment}`);
    } else if (editingContent) {
      await addHistory(articleId, actor, "Отредактировал текст");
    }

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

      await addHistory(updated[0].id as number, req.user!.name, `Опубликовал на ${platform}`);
      io.emit("article:published", updated[0]);
      return res.json(updated[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: String(err) });
    }
  });

  // Unpublish article (admin only)
  router.post("/:id/unpublish", async (req, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ error: "Только администратор может отменить публикацию" });
    }
    const { reason } = req.body as { reason?: string };
    if (!reason?.trim()) {
      return res.status(400).json({ error: "Необходимо указать причину отмены публикации" });
    }

    const { rows } = await pool.query(
      "SELECT * FROM articles WHERE id = $1",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    if (rows[0].status !== "published") {
      return res.status(400).json({ error: "Статья не опубликована" });
    }

    const { rows: updated } = await pool.query(
      `UPDATE articles SET status = 'approved', platform = NULL, published_url = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    await addHistory(
      updated[0].id as number,
      req.user!.name,
      `Отменил публикацию — «${reason.trim()}»`
    );
    io.emit("article:updated", updated[0]);
    return res.json(updated[0]);
  });

  // Delete article
  router.delete("/:id", async (req, res) => {
    await pool.query("DELETE FROM articles WHERE id = $1", [req.params.id]);
    io.emit("article:deleted", { id: Number(req.params.id) });
    res.json({ ok: true });
  });

  // List comments
  router.get("/:id/comments", async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM article_comments WHERE article_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );
    res.json(rows);
  });

  // Add comment
  router.post("/:id/comments", async (req, res) => {
    const { selectedText, commentText } = req.body as { selectedText: string; commentText: string };
    if (!selectedText || !commentText) {
      res.status(400).json({ error: "selectedText и commentText обязательны" });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO article_comments (article_id, user_name, selected_text, comment_text)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, req.user!.name, selectedText.slice(0, 500), commentText]
    );
    io.emit("article:comment_added", rows[0]);
    res.json(rows[0]);
  });

  // Resolve / reopen comment
  router.patch("/:id/comments/:commentId", async (req, res) => {
    const { resolved } = req.body as { resolved: boolean };
    const resolvedBy = resolved ? req.user!.name : null;
    const { rows } = await pool.query(
      "UPDATE article_comments SET resolved = $1, resolved_by = $2 WHERE id = $3 AND article_id = $4 RETURNING *",
      [resolved, resolvedBy, req.params.commentId, req.params.id]
    );
    if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rows[0]);
  });

  // Delete comment
  router.delete("/:id/comments/:commentId", async (req, res) => {
    await pool.query(
      "DELETE FROM article_comments WHERE id = $1 AND article_id = $2",
      [req.params.commentId, req.params.id]
    );
    res.json({ ok: true });
  });

  return router;
}
