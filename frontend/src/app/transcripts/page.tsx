"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Transcript } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Article } from "@/lib/api";

const RESULT_COLORS: Record<string, string> = {
  green:  "bg-green-400",
  yellow: "bg-yellow-400",
  red:    "bg-red-400",
};

export default function TranscriptsPage() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [generating, setGenerating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.transcripts
      .list()
      .then(setTranscripts)
      .catch((e: unknown) =>
        setError(`Не удалось загрузить звонки: ${String(e)}`)
      )
      .finally(() => setLoading(false));
    const socket = getSocket();
    socket.on("article:created", (article: Article) => {
      setTranscripts((prev) =>
        prev.map((t) =>
          t.id === article.transcript_id ? { ...t, has_article: true } : t
        )
      );
    });
    return () => { socket.off("article:created"); };
  }, []);

  async function handleGenerate(t: Transcript) {
    setGenerating(t.id);
    setError(null);
    try {
      await api.articles.generate(t.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Звонки</h1>
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Дата</th>
              <th className="px-4 py-3 text-left">Тема / Телефон</th>
              <th className="px-4 py-3 text-left">Менеджер</th>
              <th className="px-4 py-3 text-center">Итог</th>
              <th className="px-4 py-3 text-right">Транскрипт</th>
              <th className="px-4 py-3 text-center">Расшифровка</th>
              <th className="px-4 py-3 text-center">Статья</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transcripts.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {new Date(t.call_date).toLocaleString("ru-RU", {
                    day: "2-digit", month: "2-digit", year: "2-digit",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800 line-clamp-1">{t.subject}</div>
                  <div className="text-xs text-gray-400">{t.phone}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{t.manager_name}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-block w-3 h-3 rounded-full ${RESULT_COLORS[t.result_type] ?? "bg-gray-300"}`}
                    title={t.result_type}
                  />
                </td>
                <td className="px-4 py-3 text-right text-gray-400">
                  {t.transcript_len
                    ? `${Math.round(t.transcript_len / 100) / 10} кб`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  {t.transcript_len && t.transcript_len > 0 ? (
                    <Link
                      href={`/transcripts/${t.id}`}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      Читать
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {t.has_article ? (
                    <Link
                      href="/articles"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Готова →
                    </Link>
                  ) : t.transcript_len && t.transcript_len > 100 ? (
                    <button
                      onClick={() => handleGenerate(t)}
                      disabled={generating === t.id}
                      className="rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait"
                    >
                      {generating === t.id ? "Генерация…" : "Создать статью"}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-300">Мало данных</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && (
          <p className="p-8 text-center text-gray-400">Загрузка…</p>
        )}
        {!loading && transcripts.length === 0 && !error && (
          <p className="p-8 text-center text-gray-400">Нет звонков</p>
        )}
      </div>
    </div>
  );
}
