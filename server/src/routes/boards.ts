import { Router } from "express";
import type { Server } from "socket.io";
import pool from "../db.js";

async function addArticleHistory(io: Server, articleId: number, userName: string, action: string) {
  const { rows } = await pool.query(
    "INSERT INTO article_history (article_id, user_name, action) VALUES ($1, $2, $3) RETURNING *",
    [articleId, userName, action]
  );
  io.emit("article:history_added", rows[0]);
}

export function createBoardsRouter(io: Server) {
  const router = Router();

  // List boards with column/card counts
  router.get("/", async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT
        b.*,
        (SELECT COUNT(*) FROM board_columns bc WHERE bc.board_id = b.id)::int AS column_count,
        (SELECT COUNT(*) FROM board_cards ca WHERE ca.board_id = b.id)::int AS card_count
      FROM boards b
      ORDER BY b.updated_at DESC
    `);
    res.json(rows);
  });

  // Create board
  router.post("/", async (req, res) => {
    const { name, description } = req.body as { name: string; description?: string };
    if (!name?.trim()) {
      res.status(400).json({ error: "Название доски обязательно" });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO boards (name, description, created_by) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), description?.trim() || null, req.user!.name]
    );
    const board = { ...rows[0], column_count: 0, card_count: 0 };
    io.emit("board:created", board);
    res.json(board);
  });

  // Search articles not yet linked to any kanban card
  router.get("/articles/search", async (req, res) => {
    const { q } = req.query as { q?: string };
    const params: unknown[] = [];
    let where = "NOT EXISTS (SELECT 1 FROM board_cards bc WHERE bc.article_id = a.id)";
    if (q?.trim()) {
      params.push(`%${q.trim()}%`);
      where += ` AND a.title ILIKE $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT a.id, a.title, a.status FROM articles a WHERE ${where} ORDER BY a.updated_at DESC LIMIT 20`,
      params
    );
    res.json(rows);
  });

  // Find the card (if any) an article is already linked to
  router.get("/cards/by-article/:articleId", async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ca.*, b.name AS board_name, bc.name AS column_name
       FROM board_cards ca
       JOIN boards b ON b.id = ca.board_id
       JOIN board_columns bc ON bc.id = ca.column_id
       WHERE ca.article_id = $1`,
      [req.params.articleId]
    );
    res.json(rows[0] ?? null);
  });

  // Get single board with columns + cards
  router.get("/:id", async (req, res) => {
    const { rows: boardRows } = await pool.query("SELECT * FROM boards WHERE id = $1", [req.params.id]);
    if (!boardRows[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { rows: columns } = await pool.query(
      "SELECT * FROM board_columns WHERE board_id = $1 ORDER BY position ASC, id ASC",
      [req.params.id]
    );
    const { rows: cards } = await pool.query(
      "SELECT * FROM board_cards WHERE board_id = $1 ORDER BY position ASC, id ASC",
      [req.params.id]
    );
    res.json({ ...boardRows[0], columns, cards });
  });

  // Update board (rename / description)
  router.patch("/:id", async (req, res) => {
    const { name, description } = req.body as { name?: string; description?: string };
    const { rows } = await pool.query(
      `UPDATE boards SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [name?.trim(), description?.trim(), req.params.id]
    );
    if (!rows[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    io.emit("board:updated", rows[0]);
    res.json(rows[0]);
  });

  // Delete board (admin only)
  router.delete("/:id", async (req, res) => {
    if (req.user!.role !== "admin") {
      res.status(403).json({ error: "Только администратор может удалить доску" });
      return;
    }
    await pool.query("DELETE FROM boards WHERE id = $1", [req.params.id]);
    io.emit("board:deleted", { id: Number(req.params.id) });
    res.json({ ok: true });
  });

  // Create column
  router.post("/:id/columns", async (req, res) => {
    const { name } = req.body as { name: string };
    if (!name?.trim()) {
      res.status(400).json({ error: "Название колонки обязательно" });
      return;
    }
    const { rows: posRows } = await pool.query(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM board_columns WHERE board_id = $1",
      [req.params.id]
    );
    const { rows } = await pool.query(
      `INSERT INTO board_columns (board_id, name, position) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, name.trim(), posRows[0].next]
    );
    io.emit("column:created", rows[0]);
    res.json(rows[0]);
  });

  // Rename column
  router.patch("/:id/columns/:columnId", async (req, res) => {
    const { name } = req.body as { name: string };
    if (!name?.trim()) {
      res.status(400).json({ error: "Название колонки обязательно" });
      return;
    }
    const { rows } = await pool.query(
      "UPDATE board_columns SET name = $1 WHERE id = $2 AND board_id = $3 RETURNING *",
      [name.trim(), req.params.columnId, req.params.id]
    );
    if (!rows[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    io.emit("column:updated", rows[0]);
    res.json(rows[0]);
  });

  // Delete column (admin only)
  router.delete("/:id/columns/:columnId", async (req, res) => {
    if (req.user!.role !== "admin") {
      res.status(403).json({ error: "Только администратор может удалить колонку" });
      return;
    }
    await pool.query("DELETE FROM board_columns WHERE id = $1 AND board_id = $2", [
      req.params.columnId,
      req.params.id,
    ]);
    io.emit("column:deleted", { id: Number(req.params.columnId), board_id: Number(req.params.id) });
    res.json({ ok: true });
  });

  // Reorder columns
  router.patch("/:id/columns/reorder", async (req, res) => {
    const { columnIds } = req.body as { columnIds: number[] };
    if (!Array.isArray(columnIds)) {
      res.status(400).json({ error: "columnIds обязателен" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < columnIds.length; i++) {
        await client.query(
          "UPDATE board_columns SET position = $1 WHERE id = $2 AND board_id = $3",
          [i, columnIds[i], req.params.id]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    const order = columnIds.map((id, i) => ({ id, position: i }));
    io.emit("columns:reordered", { board_id: Number(req.params.id), order });
    res.json({ ok: true });
  });

  // Create card
  router.post("/:id/cards", async (req, res) => {
    const { columnId, title, description, articleId } = req.body as {
      columnId: number;
      title: string;
      description?: string;
      articleId?: number;
    };
    if (!columnId || !title?.trim()) {
      res.status(400).json({ error: "columnId и title обязательны" });
      return;
    }
    if (articleId) {
      const { rows: existing } = await pool.query(
        "SELECT id FROM board_cards WHERE article_id = $1",
        [articleId]
      );
      if (existing[0]) {
        res.status(409).json({ error: "Статья уже добавлена в канбан" });
        return;
      }
    }
    const { rows: posRows } = await pool.query(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM board_cards WHERE column_id = $1",
      [columnId]
    );
    const { rows } = await pool.query(
      `INSERT INTO board_cards (board_id, column_id, title, description, position, created_by, article_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.id, columnId, title.trim(), description?.trim() || null, posRows[0].next, req.user!.name, articleId || null]
    );
    io.emit("card:created", rows[0]);
    res.json(rows[0]);

    if (articleId) {
      const { rows: loc } = await pool.query(
        `SELECT b.name AS board_name, bc.name AS column_name FROM boards b, board_columns bc
         WHERE b.id = $1 AND bc.id = $2`,
        [req.params.id, columnId]
      );
      if (loc[0]) {
        await addArticleHistory(
          io,
          articleId,
          req.user!.name,
          `Добавил в канбан: «${loc[0].board_name}» → «${loc[0].column_name}»`
        );
      }
    }
  });

  // Update card (title / description)
  router.patch("/:id/cards/:cardId", async (req, res) => {
    const { title, description } = req.body as { title?: string; description?: string };
    const { rows } = await pool.query(
      `UPDATE board_cards SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        updated_at = NOW()
       WHERE id = $3 AND board_id = $4 RETURNING *`,
      [title?.trim(), description?.trim(), req.params.cardId, req.params.id]
    );
    if (!rows[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    io.emit("card:updated", rows[0]);
    res.json(rows[0]);
  });

  // Delete card
  router.delete("/:id/cards/:cardId", async (req, res) => {
    await pool.query("DELETE FROM board_cards WHERE id = $1 AND board_id = $2", [
      req.params.cardId,
      req.params.id,
    ]);
    io.emit("card:deleted", { id: Number(req.params.cardId), board_id: Number(req.params.id) });
    res.json({ ok: true });
  });

  // Move card between/within columns and reorder destination column
  router.patch("/:id/cards/:cardId/move", async (req, res) => {
    const { columnId, cardIds } = req.body as { columnId: number; cardIds: number[] };
    if (!columnId || !Array.isArray(cardIds)) {
      res.status(400).json({ error: "columnId и cardIds обязательны" });
      return;
    }
    const client = await pool.connect();
    let card;
    let prevColumnId: number | null = null;
    try {
      await client.query("BEGIN");
      const { rows: prevRows } = await client.query(
        "SELECT column_id FROM board_cards WHERE id = $1 AND board_id = $2",
        [req.params.cardId, req.params.id]
      );
      prevColumnId = prevRows[0]?.column_id ?? null;
      const { rows } = await client.query(
        "UPDATE board_cards SET column_id = $1 WHERE id = $2 AND board_id = $3 RETURNING *",
        [columnId, req.params.cardId, req.params.id]
      );
      card = rows[0];
      for (let i = 0; i < cardIds.length; i++) {
        await client.query(
          "UPDATE board_cards SET position = $1 WHERE id = $2 AND board_id = $3",
          [i, cardIds[i], req.params.id]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    if (!card) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const order = cardIds.map((id, i) => ({ id, position: i }));
    io.emit("card:moved", { board_id: Number(req.params.id), column_id: columnId, order });
    res.json({ ok: true });

    if (card.article_id && prevColumnId !== null && prevColumnId !== columnId) {
      const { rows: loc } = await pool.query(
        `SELECT b.name AS board_name, bc.name AS column_name FROM boards b, board_columns bc
         WHERE b.id = $1 AND bc.id = $2`,
        [req.params.id, columnId]
      );
      if (loc[0]) {
        await addArticleHistory(
          io,
          card.article_id,
          req.user!.name,
          `Переместил в канбане в раздел «${loc[0].column_name}» (${loc[0].board_name})`
        );
      }
    }
  });

  return router;
}
