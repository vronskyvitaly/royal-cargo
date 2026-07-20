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
