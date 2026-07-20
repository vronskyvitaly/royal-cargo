"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Board } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export default function KanbanPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.boards.list().then(setBoards).finally(() => setLoading(false));

    const socket = getSocket();

    const upsert = (board: Board) =>
      setBoards((prev) => {
        const idx = prev.findIndex((b) => b.id === board.id);
        return idx >= 0 ? prev.map((b) => (b.id === board.id ? { ...b, ...board } : b)) : [board, ...prev];
      });

    const onDeleted = ({ id }: { id: number }) =>
      setBoards((prev) => prev.filter((b) => b.id !== id));

    socket.on("board:created", upsert);
    socket.on("board:updated", upsert);
    socket.on("board:deleted", onDeleted);
    return () => {
      socket.off("board:created", upsert);
      socket.off("board:updated", upsert);
      socket.off("board:deleted", onDeleted);
    };
  }, []);

  async function createBoard() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.boards.create(name.trim(), description.trim() || undefined);
      setName("");
      setDescription("");
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-bold">Канбан</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          + Новая доска
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
          <svg className="animate-spin shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="text-sm">Загрузка…</span>
        </div>
      )}

      {!loading && boards.length === 0 && (
        <p className="p-8 text-center text-gray-400">Пока нет ни одной доски. Создайте первую.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {boards.map((b) => (
          <Link
            key={b.id}
            href={`/kanban/${b.id}`}
            className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col gap-2"
          >
            <h2 className="font-semibold text-gray-800 line-clamp-1">{b.name}</h2>
            {b.description && (
              <p className="text-xs text-gray-500 line-clamp-2">{b.description}</p>
            )}
            <div className="mt-auto pt-2 flex items-center justify-between text-xs text-gray-400">
              <span>{b.column_count ?? 0} колонок · {b.card_count ?? 0} карточек</span>
              <span>{b.created_by}</span>
            </div>
          </Link>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div
            className="w-full max-w-sm rounded-xl bg-white shadow-xl p-5 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Новая доска</h2>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createBoard()}
              placeholder="Название доски"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Описание (необязательно)"
              rows={3}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none resize-none"
            />
            <div className="flex justify-end gap-2 mt-1">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={createBoard}
                disabled={!name.trim() || creating}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {creating ? "Создание…" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
