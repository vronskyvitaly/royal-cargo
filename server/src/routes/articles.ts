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

// Article-level fields (id, transcript_id, current_version_id, likes, transcript info, ...)
// merged with the title/content/status/etc. of one specific version — keeps `id` as the
// article's own id (version has its own, different `id`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeArticleWithVersion(article: any, version: any) {
  return {
    ...article,
    title: version.title,
    content: version.content,
    status: version.status,
    platform: version.platform,
    published_url: version.published_url,
    review_comment: version.review_comment,
    reviewed_by: version.reviewed_by,
    last_edited_by: version.last_edited_by,
    updated_at: version.updated_at,
    version_id: version.id,
    version_number: version.version_number,
    is_current_version: version.id === article.current_version_id,
  };
}

// Copies a version's fields onto `articles` — but only if that version is still the
// article's current one (no-op otherwise, e.g. when editing an older version).
async function syncMirrorIfCurrent(articleId: number, versionId: number) {
  await pool.query(
    `UPDATE articles a SET
       title = v.title, content = v.content, status = v.status, platform = v.platform,
       published_url = v.published_url, review_comment = v.review_comment,
       reviewed_by = v.reviewed_by, last_edited_by = v.last_edited_by, updated_at = v.updated_at
     FROM article_versions v
     WHERE a.id = $1 AND a.current_version_id = $2 AND v.id = $2`,
    [articleId, versionId]
  );
}

export function createArticlesRouter(io: Server) {
  const router = Router();

  // List all articles
  router.get("/", async (req, res) => {
    const { rows } = await pool.query(`
      SELECT
        a.id, a.title, a.status, a.platform, a.published_url,
        a.review_comment, a.reviewed_by, a.last_edited_by, a.created_at, a.updated_at,
        ct.subject AS transcript_subject, ct.call_date, ct.manager_name,
        ct.lead_id, ct.lead_url,
        a.transcript_id,
        ARRAY(
          SELECT DISTINCT ah.user_name
          FROM article_history ah
          WHERE ah.article_id = a.id AND ah.action LIKE 'Одобрил%'
          ORDER BY ah.user_name
        ) AS all_reviewers,
        (SELECT COUNT(*) FROM article_likes al WHERE al.article_id = a.id)::int AS like_count,
        EXISTS(SELECT 1 FROM article_likes al2 WHERE al2.article_id = a.id AND al2.user_id = $1) AS liked_by_me,
        ARRAY(
          SELECT u.name FROM article_likes al3
          JOIN users u ON u.id = al3.user_id
          WHERE al3.article_id = a.id
          ORDER BY al3.created_at ASC
        ) AS liked_by,
        (SELECT COUNT(*) FROM article_discussion ad WHERE ad.version_id = a.current_version_id)::int AS comment_count,
        (SELECT COUNT(*) FROM article_versions v WHERE v.article_id = a.id)::int AS version_count
      FROM articles a
      LEFT JOIN call_transcripts ct ON ct.id = a.transcript_id
      ORDER BY a.updated_at DESC
    `, [req.user!.userId]);
    res.json(rows);
  });

  // Get single article — optionally a specific version via ?version=<version_number>, else current
  router.get("/:id", async (req, res) => {
    const { rows: articleRows } = await pool.query(
      `SELECT a.*, ct.subject AS transcript_subject, ct.call_date, ct.transcript_raw,
              ct.lead_id, ct.lead_url,
              (SELECT COUNT(*) FROM article_likes al WHERE al.article_id = a.id)::int AS like_count,
              EXISTS(SELECT 1 FROM article_likes al2 WHERE al2.article_id = a.id AND al2.user_id = $2) AS liked_by_me,
              ARRAY(
                SELECT u.name FROM article_likes al3
                JOIN users u ON u.id = al3.user_id
                WHERE al3.article_id = a.id
                ORDER BY al3.created_at ASC
              ) AS liked_by
       FROM articles a
       LEFT JOIN call_transcripts ct ON ct.id = a.transcript_id
       WHERE a.id = $1`,
      [req.params.id, req.user!.userId]
    );
    const article = articleRows[0];
    if (!article) return res.status(404).json({ error: "Not found" });

    const { rows: versions } = await pool.query(
      `SELECT id, version_number, status, platform, published_url, created_by, created_at, updated_at
       FROM article_versions WHERE article_id = $1 ORDER BY version_number ASC`,
      [req.params.id]
    );

    const requestedVersionNumber = req.query.version ? Number(req.query.version) : null;
    const targetSummary = requestedVersionNumber
      ? versions.find((v) => v.version_number === requestedVersionNumber)
      : versions.find((v) => v.id === article.current_version_id);
    if (!targetSummary) return res.status(404).json({ error: "Version not found" });

    const { rows: versionRows } = await pool.query(
      "SELECT * FROM article_versions WHERE id = $1",
      [targetSummary.id]
    );
    const version = versionRows[0];

    const { rows: history } = await pool.query(
      "SELECT id, user_name, action, created_at FROM article_history WHERE article_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );
    const { rows: discussion } = await pool.query(
      "SELECT id, article_id, version_id, user_name, comment_text, created_at, updated_at FROM article_discussion WHERE version_id = $1 ORDER BY created_at ASC",
      [version.id]
    );
    const { rows: comments } = await pool.query(
      "SELECT * FROM article_comments WHERE version_id = $1 ORDER BY created_at ASC",
      [version.id]
    );

    return res.json({
      ...mergeArticleWithVersion(article, version),
      versions,
      history,
      discussion,
      comments,
    });
  });

  // Toggle like (one per user) — article-level, shared across all versions
  router.post("/:id/like", async (req, res) => {
    const articleId = Number(req.params.id);
    const userId = req.user!.userId;
    const { rows: existing } = await pool.query(
      "SELECT id FROM article_likes WHERE article_id = $1 AND user_id = $2",
      [articleId, userId]
    );
    let liked: boolean;
    if (existing[0]) {
      await pool.query("DELETE FROM article_likes WHERE id = $1", [existing[0].id]);
      liked = false;
    } else {
      await pool.query(
        "INSERT INTO article_likes (article_id, user_id) VALUES ($1, $2)",
        [articleId, userId]
      );
      liked = true;
    }
    const { rows: countRows } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM article_likes WHERE article_id = $1",
      [articleId]
    );
    const { rows: likedByRows } = await pool.query(
      `SELECT u.name FROM article_likes al
       JOIN users u ON u.id = al.user_id
       WHERE al.article_id = $1
       ORDER BY al.created_at ASC`,
      [articleId]
    );
    const likeCount = countRows[0].count as number;
    const likedBy = likedByRows.map((r) => r.name as string);
    io.emit("article:like_toggled", { article_id: articleId, like_count: likeCount, liked_by: likedBy });
    res.json({ liked, like_count: likeCount, liked_by: likedBy });
  });

  // List discussion comments (general, not tied to selected text) for a version
  router.get("/:id/discussion", async (req, res) => {
    const versionId = req.query.versionId ? Number(req.query.versionId) : null;
    const { rows } = await pool.query(
      versionId
        ? "SELECT * FROM article_discussion WHERE article_id = $1 AND version_id = $2 ORDER BY created_at ASC"
        : "SELECT * FROM article_discussion WHERE article_id = $1 ORDER BY created_at ASC",
      versionId ? [req.params.id, versionId] : [req.params.id]
    );
    res.json(rows);
  });

  // Add discussion comment (to a specific version)
  router.post("/:id/discussion", async (req, res) => {
    const { commentText, versionId } = req.body as { commentText: string; versionId: number };
    if (!commentText?.trim()) {
      res.status(400).json({ error: "Текст комментария обязателен" });
      return;
    }
    if (!versionId) {
      res.status(400).json({ error: "versionId обязателен" });
      return;
    }
    const { rows } = await pool.query(
      "INSERT INTO article_discussion (article_id, version_id, user_name, comment_text) VALUES ($1, $2, $3, $4) RETURNING *",
      [req.params.id, versionId, req.user!.name, commentText.trim()]
    );
    io.emit("article:discussion_added", rows[0]);
    res.json(rows[0]);
  });

  // Edit discussion comment (author only)
  router.patch("/:id/discussion/:commentId", async (req, res) => {
    const { commentText } = req.body as { commentText: string };
    if (!commentText?.trim()) {
      res.status(400).json({ error: "Текст комментария обязателен" });
      return;
    }
    const { rows: existing } = await pool.query(
      "SELECT user_name FROM article_discussion WHERE id = $1 AND article_id = $2",
      [req.params.commentId, req.params.id]
    );
    if (!existing[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing[0].user_name !== req.user!.name) {
      res.status(403).json({ error: "Редактировать можно только свои комментарии" });
      return;
    }
    const { rows } = await pool.query(
      "UPDATE article_discussion SET comment_text = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [commentText.trim(), req.params.commentId]
    );
    io.emit("article:discussion_updated", rows[0]);
    res.json(rows[0]);
  });

  // Delete discussion comment
  router.delete("/:id/discussion/:commentId", async (req, res) => {
    await pool.query(
      "DELETE FROM article_discussion WHERE id = $1 AND article_id = $2",
      [req.params.commentId, req.params.id]
    );
    io.emit("article:discussion_deleted", { id: Number(req.params.commentId), article_id: Number(req.params.id) });
    res.json({ ok: true });
  });

  // Generate article from transcript (creates version 1)
  router.post("/generate", async (req, res) => {
    const { transcriptId } = req.body as { transcriptId: number };
    if (!transcriptId)
      return res.status(400).json({ error: "transcriptId required" });

    const { rows } = await pool.query(
      "SELECT id, subject, summary, transcript_raw FROM call_transcripts WHERE id = $1",
      [transcriptId]
    );
    const transcript = rows[0];
    if (!transcript) return res.status(404).json({ error: "Transcript not found" });
    if (!transcript.transcript_raw)
      return res.status(400).json({ error: "Transcript has no raw text" });

    const userName = req.user!.name;
    // Prefer the call summary as the topic — `subject` is often just a caller-ID
    // label like "Входящий от +7 ..." and isn't useful for the article prompt
    // or the alta.ru document search.
    const topic = (transcript.summary as string | null) || (transcript.subject as string);

    // Respond immediately — generation runs in background to avoid proxy timeout
    res.status(202).json({ message: "Генерация запущена" });

    (async () => {
      try {
        const { title, content } = await generateArticle(
          transcript.transcript_raw as string,
          topic
        );
        const { rows: inserted } = await pool.query(
          `INSERT INTO articles (transcript_id, title, content, status)
           VALUES ($1, $2, $3, 'draft') RETURNING *`,
          [transcriptId, title, content]
        );
        const articleId = inserted[0].id as number;

        const { rows: verRows } = await pool.query(
          `INSERT INTO article_versions (article_id, version_number, title, content, status, created_by)
           VALUES ($1, 1, $2, $3, 'draft', $4) RETURNING *`,
          [articleId, title, content, userName]
        );
        await pool.query("UPDATE articles SET current_version_id = $1 WHERE id = $2", [verRows[0].id, articleId]);

        await addHistory(articleId, userName, "Создал черновик");
        const { rows: freshArticle } = await pool.query("SELECT * FROM articles WHERE id = $1", [articleId]);
        io.emit("article:created", freshArticle[0]);
      } catch (err) {
        console.error("Article generation error:", err);
        io.emit("article:generate_error", { transcriptId, error: String(err) });
      }
    })();
  });

  // Regenerate the article from its original transcript — only while the current
  // version is a draft or rejected (never overwrites an approved/published version).
  router.post("/:id/regenerate", async (req, res) => {
    const articleId = Number(req.params.id);
    const { rows: artRows } = await pool.query("SELECT * FROM articles WHERE id = $1", [articleId]);
    const article = artRows[0];
    if (!article) return res.status(404).json({ error: "Not found" });
    if (!article.transcript_id) {
      return res.status(400).json({ error: "У статьи нет исходного звонка для перегенерации" });
    }

    const { rows: verRows } = await pool.query(
      "SELECT * FROM article_versions WHERE id = $1",
      [article.current_version_id]
    );
    const currentVersion = verRows[0];
    if (!currentVersion || !["draft", "rejected"].includes(currentVersion.status)) {
      return res.status(400).json({
        error: "Перегенерировать можно только черновик или отклонённую статью — сначала верните текущую версию на доработку",
      });
    }

    const { rows: transcriptRows } = await pool.query(
      "SELECT subject, summary, transcript_raw FROM call_transcripts WHERE id = $1",
      [article.transcript_id]
    );
    const transcript = transcriptRows[0];
    if (!transcript?.transcript_raw) {
      return res.status(400).json({ error: "Расшифровка звонка недоступна" });
    }

    const userName = req.user!.name;
    const topic = (transcript.summary as string | null) || (transcript.subject as string);

    res.status(202).json({ message: "Перегенерация запущена" });

    (async () => {
      try {
        const { title, content } = await generateArticle(transcript.transcript_raw as string, topic);

        const { rows: nextNumRows } = await pool.query(
          "SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM article_versions WHERE article_id = $1",
          [articleId]
        );
        const nextNumber = nextNumRows[0].next as number;

        const { rows: inserted } = await pool.query(
          `INSERT INTO article_versions (article_id, version_number, title, content, status, created_by)
           VALUES ($1, $2, $3, $4, 'draft', $5) RETURNING *`,
          [articleId, nextNumber, title, content, userName]
        );
        const newVersion = inserted[0];

        await pool.query(
          `UPDATE articles SET current_version_id = $1, title = $2, content = $3, status = 'draft',
             platform = NULL, published_url = NULL, review_comment = NULL, reviewed_by = NULL,
             last_edited_by = NULL, updated_at = NOW()
           WHERE id = $4`,
          [newVersion.id, title, content, articleId]
        );

        await addHistory(articleId, userName, `Перегенерировал статью (версия ${nextNumber})`);

        const { rows: freshArticle } = await pool.query("SELECT * FROM articles WHERE id = $1", [articleId]);
        const merged = mergeArticleWithVersion(freshArticle[0], newVersion);
        io.emit("article:regenerated", merged);
        io.emit("article:updated", merged);
      } catch (err) {
        console.error("Article regeneration error:", err);
        io.emit("article:generate_error", { transcriptId: article.transcript_id, articleId, error: String(err) });
      }
    })();
  });

  // Update a specific version (edit title/content, approve, reject) — any version, not just current
  router.put("/:id/versions/:versionId", async (req, res) => {
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
      `UPDATE article_versions SET
        title = COALESCE($1, title),
        content = COALESCE($2, content),
        status = COALESCE($3, status),
        reviewed_by = COALESCE($4, reviewed_by),
        review_comment = COALESCE($5, review_comment),
        last_edited_by = COALESCE($6, last_edited_by),
        updated_at = NOW()
       WHERE id = $7 AND article_id = $8 RETURNING *`,
      [title, content, status, reviewedBy, reviewComment, lastEditedBy, req.params.versionId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    const version = rows[0];
    const articleId = Number(req.params.id);

    await syncMirrorIfCurrent(articleId, version.id);

    const versionLabel = `версия ${version.version_number}`;
    if (status === "approved") {
      await addHistory(articleId, actor, `Одобрил статью (${versionLabel})`);
    } else if (status === "rejected") {
      const comment = reviewComment ? ` — «${reviewComment}»` : "";
      await addHistory(articleId, actor, `Отклонил статью${comment} (${versionLabel})`);
    } else if (status === "draft") {
      const comment = reviewComment ? ` — «${reviewComment}»` : "";
      await addHistory(articleId, actor, `Вернул на доработку${comment} (${versionLabel})`);
    } else if (editingContent) {
      await addHistory(articleId, actor, `Отредактировал текст (${versionLabel})`);
    }

    const { rows: freshArticle } = await pool.query("SELECT * FROM articles WHERE id = $1", [articleId]);
    const merged = mergeArticleWithVersion(freshArticle[0], version);
    io.emit("article:version_updated", merged);
    // Only broadcast article:updated (consumed by the list page, kanban, etc.) when the
    // edited version is actually the current one — otherwise the mirror didn't change.
    if (merged.is_current_version) {
      io.emit("article:updated", merged);
    }
    return res.json(merged);
  });

  // Make a version the article's current one
  router.post("/:id/versions/:versionId/make-current", async (req, res) => {
    const articleId = Number(req.params.id);
    const { rows: verRows } = await pool.query(
      "SELECT * FROM article_versions WHERE id = $1 AND article_id = $2",
      [req.params.versionId, articleId]
    );
    const version = verRows[0];
    if (!version) return res.status(404).json({ error: "Not found" });

    await pool.query(
      `UPDATE articles SET
         current_version_id = $1, title = $2, content = $3, status = $4, platform = $5,
         published_url = $6, review_comment = $7, reviewed_by = $8, last_edited_by = $9, updated_at = $10
       WHERE id = $11`,
      [version.id, version.title, version.content, version.status, version.platform, version.published_url,
        version.review_comment, version.reviewed_by, version.last_edited_by, version.updated_at, articleId]
    );

    await addHistory(articleId, req.user!.name, `Сделал текущей версию ${version.version_number}`);

    const { rows: freshArticle } = await pool.query("SELECT * FROM articles WHERE id = $1", [articleId]);
    const merged = mergeArticleWithVersion(freshArticle[0], version);
    io.emit("article:updated", merged);
    res.json(merged);
  });

  // Publish the current version to WordPress or Megagroup
  router.post("/:id/publish", async (req, res) => {
    const { platform } = req.body as { platform: "wordpress" | "megagroup" };
    const articleId = Number(req.params.id);

    const { rows: artRows } = await pool.query("SELECT * FROM articles WHERE id = $1", [articleId]);
    const article = artRows[0];
    if (!article) return res.status(404).json({ error: "Not found" });

    const { rows: verRows } = await pool.query(
      "SELECT * FROM article_versions WHERE id = $1",
      [article.current_version_id]
    );
    const version = verRows[0];
    if (!version) return res.status(404).json({ error: "Current version not found" });
    if (version.status !== "approved")
      return res.status(400).json({ error: "Only approved articles can be published" });

    try {
      let publishedUrl = "";
      if (platform === "wordpress") {
        publishedUrl = await publishToWordPress(version.title as string, version.content as string);
      } else if (platform === "megagroup") {
        publishedUrl = await publishToMegagroup(version.title as string, version.content as string);
      } else {
        return res.status(400).json({ error: "Unknown platform" });
      }

      const { rows: updatedVer } = await pool.query(
        `UPDATE article_versions SET status = 'published', platform = $1, published_url = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [platform, publishedUrl, version.id]
      );
      await syncMirrorIfCurrent(articleId, version.id);

      await addHistory(articleId, req.user!.name, `Опубликовал на ${platform} (версия ${version.version_number})`);

      const { rows: freshArticle } = await pool.query("SELECT * FROM articles WHERE id = $1", [articleId]);
      const merged = mergeArticleWithVersion(freshArticle[0], updatedVer[0]);
      io.emit("article:published", merged);
      return res.json(merged);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: String(err) });
    }
  });

  // Unpublish the current version (admin only)
  router.post("/:id/unpublish", async (req, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ error: "Только администратор может отменить публикацию" });
    }
    const { reason } = req.body as { reason?: string };
    if (!reason?.trim()) {
      return res.status(400).json({ error: "Необходимо указать причину отмены публикации" });
    }
    const articleId = Number(req.params.id);

    const { rows: artRows } = await pool.query("SELECT * FROM articles WHERE id = $1", [articleId]);
    const article = artRows[0];
    if (!article) return res.status(404).json({ error: "Not found" });

    const { rows: verRows } = await pool.query(
      "SELECT * FROM article_versions WHERE id = $1",
      [article.current_version_id]
    );
    const version = verRows[0];
    if (!version || version.status !== "published") {
      return res.status(400).json({ error: "Статья не опубликована" });
    }

    const { rows: updatedVer } = await pool.query(
      `UPDATE article_versions SET status = 'approved', platform = NULL, published_url = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [version.id]
    );
    await syncMirrorIfCurrent(articleId, version.id);

    await addHistory(
      articleId,
      req.user!.name,
      `Отменил публикацию — «${reason.trim()}» (версия ${version.version_number})`
    );

    const { rows: freshArticle } = await pool.query("SELECT * FROM articles WHERE id = $1", [articleId]);
    const merged = mergeArticleWithVersion(freshArticle[0], updatedVer[0]);
    io.emit("article:updated", merged);
    return res.json(merged);
  });

  // Delete article (cascades to versions, comments, discussion, likes, history)
  router.delete("/:id", async (req, res) => {
    await pool.query("DELETE FROM articles WHERE id = $1", [req.params.id]);
    io.emit("article:deleted", { id: Number(req.params.id) });
    res.json({ ok: true });
  });

  // List inline comments for a version
  router.get("/:id/comments", async (req, res) => {
    const versionId = req.query.versionId ? Number(req.query.versionId) : null;
    const { rows } = await pool.query(
      versionId
        ? "SELECT * FROM article_comments WHERE article_id = $1 AND version_id = $2 ORDER BY created_at ASC"
        : "SELECT * FROM article_comments WHERE article_id = $1 ORDER BY created_at ASC",
      versionId ? [req.params.id, versionId] : [req.params.id]
    );
    res.json(rows);
  });

  // Add inline comment (to a specific version)
  router.post("/:id/comments", async (req, res) => {
    const { selectedText, commentText, versionId } = req.body as {
      selectedText: string;
      commentText: string;
      versionId: number;
    };
    if (!selectedText || !commentText) {
      res.status(400).json({ error: "selectedText и commentText обязательны" });
      return;
    }
    if (!versionId) {
      res.status(400).json({ error: "versionId обязателен" });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO article_comments (article_id, version_id, user_name, selected_text, comment_text)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, versionId, req.user!.name, selectedText.slice(0, 500), commentText]
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
    io.emit("article:comment_resolved", rows[0]);
    res.json(rows[0]);
  });

  // Delete comment
  router.delete("/:id/comments/:commentId", async (req, res) => {
    await pool.query(
      "DELETE FROM article_comments WHERE id = $1 AND article_id = $2",
      [req.params.commentId, req.params.id]
    );
    io.emit("article:comment_deleted", { id: Number(req.params.commentId), article_id: Number(req.params.id) });
    res.json({ ok: true });
  });

  return router;
}
