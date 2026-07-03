import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createArticlesRouter } from "./routes/articles.js";
import authRouter from "./routes/auth.js";
import profileRouter from "./routes/profile.js";
import registerRouter from "./routes/register.js";
import usersRouter from "./routes/users.js";
import transcriptsRouter from "./routes/transcripts.js";
import { requireAuth } from "./middleware/auth.js";

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

app.get("/health", (_req, res) => res.json({ status: "ok" }));

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.on("disconnect", () => console.log(`Client disconnected: ${socket.id}`));
});

const PORT = process.env.PORT ?? 4000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
