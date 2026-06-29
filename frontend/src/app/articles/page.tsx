"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Article } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import StatusBadge from "@/components/StatusBadge";

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);

  useEffect(() => {
    api.articles.list().then(setArticles);
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Статьи</h1>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
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
                      {new Date(a.call_date).toLocaleDateString("ru-RU")}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={a.status} />
                </td>
                <td className="px-4 py-3 text-gray-500 capitalize">
                  {a.platform ?? "—"}
                  {a.published_url && (
                    <a
                      href={a.published_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-blue-500 hover:underline text-xs"
                    >
                      ↗
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-gray-400 whitespace-nowrap">
                  {new Date(a.updated_at).toLocaleString("ru-RU", {
                    day: "2-digit", month: "2-digit",
                    hour: "2-digit", minute: "2-digit",
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
        {articles.length === 0 && (
          <p className="p-8 text-center text-gray-400">
            Нет статей. Создайте первую на странице Звонки.
          </p>
        )}
      </div>
    </div>
  );
}
