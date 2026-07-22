import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createArticlesRouter } from "./routes/articles.js";
import { createBoardsRouter } from "./routes/boards.js";
import authRouter from "./routes/auth.js";
import profileRouter from "./routes/profile.js";
import registerRouter from "./routes/register.js";
import usersRouter from "./routes/users.js";
import transcriptsRouter from "./routes/transcripts.js";
import { requireAuth } from "./middleware/auth.js";
import pool from "./db.js";

// DB migration: add resolved_by if missing
pool.query(
  "ALTER TABLE article_comments ADD COLUMN IF NOT EXISTS resolved_by TEXT"
).catch((e: unknown) => console.error("Migration error:", e));

// DB migration: Kanban boards
pool.query(`
  CREATE TABLE IF NOT EXISTS boards (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS board_columns (
    id SERIAL PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS board_cards (
    id SERIAL PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_id INTEGER NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`).catch((e: unknown) => console.error("Migration error:", e));

pool.query(
  "ALTER TABLE board_cards ADD COLUMN IF NOT EXISTS article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL"
).catch((e: unknown) => console.error("Migration error:", e));

pool.query(
  "CREATE UNIQUE INDEX IF NOT EXISTS board_cards_article_id_idx ON board_cards(article_id) WHERE article_id IS NOT NULL"
).catch((e: unknown) => console.error("Migration error:", e));

// DB migration: article discussion comments + likes
pool.query(`
  CREATE TABLE IF NOT EXISTS article_discussion (
    id SERIAL PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS article_likes (
    id SERIAL PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(article_id, user_id)
  );
`).catch((e: unknown) => console.error("Migration error:", e));

pool.query(
  "ALTER TABLE article_discussion ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()"
).catch((e: unknown) => console.error("Migration error:", e));

// DB migration: article versions (regeneration history) — steps must run in order,
// so this is a single async chain rather than independent fire-and-forget queries.
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS article_versions (
        id SERIAL PRIMARY KEY,
        article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'draft',
        platform VARCHAR,
        published_url TEXT,
        review_comment TEXT,
        reviewed_by TEXT,
        last_edited_by TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(article_id, version_number)
      );
      ALTER TABLE articles ADD COLUMN IF NOT EXISTS current_version_id INTEGER REFERENCES article_versions(id);
      ALTER TABLE article_comments ADD COLUMN IF NOT EXISTS version_id INTEGER REFERENCES article_versions(id);
      ALTER TABLE article_discussion ADD COLUMN IF NOT EXISTS version_id INTEGER REFERENCES article_versions(id);
    `);

    // Backfill: every pre-existing article gets a "version 1" snapshot of its current row
    await pool.query(`
      INSERT INTO article_versions
        (article_id, version_number, title, content, status, platform, published_url, review_comment, reviewed_by, last_edited_by, created_by, created_at, updated_at)
      SELECT a.id, 1, a.title, a.content, a.status, a.platform, a.published_url, a.review_comment, a.reviewed_by, a.last_edited_by,
             COALESCE(a.last_edited_by, a.reviewed_by, 'Система'), a.created_at, a.updated_at
      FROM articles a
      WHERE NOT EXISTS (SELECT 1 FROM article_versions v WHERE v.article_id = a.id)
    `);

    await pool.query(`
      UPDATE articles a SET current_version_id = v.id
      FROM article_versions v
      WHERE v.article_id = a.id
        AND v.version_number = (SELECT MAX(version_number) FROM article_versions WHERE article_id = a.id)
        AND a.current_version_id IS NULL
    `);

    await pool.query(`
      UPDATE article_comments c SET version_id = v.id
      FROM article_versions v
      WHERE v.article_id = c.article_id AND v.version_number = 1 AND c.version_id IS NULL
    `);

    await pool.query(`
      UPDATE article_discussion d SET version_id = v.id
      FROM article_versions v
      WHERE v.article_id = d.article_id AND v.version_number = 1 AND d.version_id IS NULL
    `);
  } catch (e) {
    console.error("Migration error (article_versions):", e);
  }
})();

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:3000" }));
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/auth/register", registerRouter);
app.use("/api/profile", profileRouter);
app.use("/api/users", usersRouter);
app.use("/api/transcripts", requireAuth, transcriptsRouter);
app.use("/api/articles", requireAuth, createArticlesRouter(io));
app.use("/api/boards", requireAuth, createBoardsRouter(io));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.on("disconnect", () => console.log(`Client disconnected: ${socket.id}`));
});

const PORT = process.env.PORT ?? 4000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
