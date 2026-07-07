"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Article } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import StatusBadge from "@/components/StatusBadge";

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.articles.list().then(setArticles).finally(() => setLoading(false));

    const socket = getSocket();

    const upsert = (article: Article) =>
      setArticles((prev) => {
        const idx = prev.findIndex((a) => a.id === article.id);
        return idx >= 0
          ? prev.map((a) => (a.id === article.id ? article : a))
          : [article, ...prev];
      });

    socket.on("article:created", upsert);
    socket.on("article:updated", upsert);
    socket.on("article:published", upsert);
    socket.on("article:deleted", ({ id }: { id: number }) =>
      setArticles((prev) => prev.filter((a) => a.id !== id))
    );
    return () => {
      socket.off("article:created");
      socket.off("article:updated");
      socket.off("article:published");
      socket.off("article:deleted");
    };
  }, []);

  const spinner = (
    <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
      <svg className="animate-spin shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2"/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      </svg>
      <span className="text-sm">Загрузка…</span>
    </div>
  );

  const empty = (
    <p className="p-8 text-center text-gray-400">Нет статей. Создайте первую на странице Звонки.</p>
  );

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-4">Статьи</h1>

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-2">
        {loading && spinner}
        {!loading && articles.length === 0 && empty}
        {articles.map((a) => (
          <div key={a.id} className="rounded-xl border border-gray-200 bg-white shadow-sm p-3.5">
            {/* Title */}
            <div className="font-medium text-gray-800 text-sm leading-snug line-clamp-2 mb-2">
              {a.title}
            </div>

            {/* Source */}
            {a.transcript_subject && (
              <div className="text-xs text-gray-400 line-clamp-1 mb-2.5">
                {a.transcript_subject}
                {a.call_date && (
                  <span className="ml-1.5">
                    · {new Date(a.call_date).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}
                  </span>
                )}
              </div>
            )}

            {/* Status row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={a.status} />
                {(a.status === "approved" || a.status === "published") && (a.all_reviewers?.length ?? 0) > 0 && (
                  <span className="text-xs text-green-600">✓ {a.all_reviewers!.join(", ")}</span>
                )}
                {a.reviewed_by && a.status === "rejected" && (
                  <span className="text-xs text-red-500">✕ {a.reviewed_by}</span>
                )}
              </div>
              <span className="text-xs text-gray-400">
                {new Date(a.updated_at).toLocaleString("ru-RU", {
                  day: "2-digit", month: "2-digit",
                  hour: "2-digit", minute: "2-digit",
                  timeZone: "Europe/Moscow",
                })}
              </span>
            </div>

            {/* Platform + button */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 capitalize">
                {a.platform ?? "—"}
                {a.published_url && (
                  <a href={a.published_url} target="_blank" rel="noopener noreferrer"
                    className="ml-1 text-blue-500">↗</a>
                )}
              </span>
              <Link
                href={`/articles/${a.id}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                Открыть
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Заголовок</th>
              <th className="px-4 py-3 text-left">Источник</th>
              <th className="px-4 py-3 text-center">Статус</th>
              <th className="px-4 py-3 text-left">Платформа</th>
              <th className="px-4 py-3 text-right">Обновлено</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {articles.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 max-w-xs">
                  <span className="font-medium text-gray-800 line-clamp-2">{a.title}</span>
                </td>
                <td className="px-4 py-3 text-gray-500 max-w-[200px]">
                  <div className="line-clamp-1 text-xs">{a.transcript_subject ?? "—"}</div>
                  {a.call_date && (
                    <div className="text-xs text-gray-400">
                      {new Date(a.call_date).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <StatusBadge status={a.status} />
                    {(a.status === "approved" || a.status === "published") && (a.all_reviewers?.length ?? 0) > 0 && (
                      <span className="text-xs text-green-600 text-center">✓ {a.all_reviewers!.join(", ")}</span>
                    )}
                    {a.reviewed_by && a.status === "rejected" && (
                      <span className="text-xs text-red-500">✕ {a.reviewed_by}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 capitalize">
                  {a.platform ?? "—"}
                  {a.published_url && (
                    <a href={a.published_url} target="_blank" rel="noopener noreferrer"
                      className="ml-1 text-blue-500 hover:underline text-xs">↗</a>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-gray-400 whitespace-nowrap">
                  {new Date(a.updated_at).toLocaleString("ru-RU", {
                    day: "2-digit", month: "2-digit",
                    hour: "2-digit", minute: "2-digit",
                    timeZone: "Europe/Moscow",
                  })}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/articles/${a.id}`}
                    className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                  >
                    Открыть
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && spinner}
        {!loading && articles.length === 0 && empty}
      </div>
    </div>
  );
}
