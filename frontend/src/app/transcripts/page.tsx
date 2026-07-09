"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type Transcript, type TranscriptFilters } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Article } from "@/lib/api";

const RESULT_COLORS: Record<string, string> = {
  green:  "bg-green-400",
  yellow: "bg-yellow-400",
  red:    "bg-red-400",
};

const RESULT_LABELS: Record<string, string> = {
  green:  "Положительный",
  yellow: "Нейтральный",
  red:    "Негативный",
};

const LIMIT = 25;

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
}

function ResultDot({ type }: { type: string }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${RESULT_COLORS[type] ?? "bg-gray-300"}`}
      title={RESULT_LABELS[type] ?? type}
    />
  );
}

export default function TranscriptsPage() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [generating, setGenerating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managers, setManagers] = useState<string[]>([]);

  const [search, setSearch]       = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [resultF, setResultF]     = useState("all");
  const [hasArticle, setHasArticle] = useState("all");
  const [manager, setManager]     = useState("all");

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const load = useCallback((filters: TranscriptFilters) => {
    setLoading(true);
    setError(null);
    api.transcripts
      .list(filters)
      .then((data) => {
        setTranscripts(data.rows);
        setTotal(data.total);
      })
      .catch((e: unknown) => setError(`Не удалось загрузить звонки: ${String(e)}`))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.transcripts.managers().then(setManagers).catch(() => {});
  }, []);

  useEffect(() => {
    load({
      page,
      limit: LIMIT,
      search: search || undefined,
      result: resultF !== "all" ? resultF : undefined,
      has_article: hasArticle !== "all" ? (hasArticle as "yes" | "no") : undefined,
      manager: manager !== "all" ? manager : undefined,
    });
  }, [page, search, resultF, hasArticle, manager, load]);

  useEffect(() => {
    const socket = getSocket();

    const onCreated = (article: Article) => {
      setGenerating((prev) => (prev === article.transcript_id ? null : prev));
      setTranscripts((prev) =>
        prev.map((t) =>
          t.id === article.transcript_id ? { ...t, has_article: true } : t
        )
      );
    };

    const onError = ({ transcriptId, error: msg }: { transcriptId: number; error: string }) => {
      setGenerating((prev) => (prev === transcriptId ? null : prev));
      setError(`Ошибка генерации: ${msg}`);
    };

    socket.on("article:created", onCreated);
    socket.on("article:generate_error", onError);
    return () => {
      socket.off("article:created", onCreated);
      socket.off("article:generate_error", onError);
    };
  }, []);

  function applySearch() {
    setSearch(searchInput);
    setPage(1);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) applySearch();
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function changeFilter<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1); };
  }

  async function handleGenerate(t: Transcript) {
    setGenerating(t.id);
    setError(null);
    try {
      await api.articles.generate(t.id);
      // 202 returned — spinner stays; socket event will clear it when done
    } catch (e) {
      setError(String(e));
      setGenerating(null);
    }
  }

  const from = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const to   = Math.min(page * LIMIT, total);
  const hasActiveFilters = search || resultF !== "all" || hasArticle !== "all" || manager !== "all";

  const SelectWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="relative flex-1 min-w-[130px]">{children}</div>
  );

  const chevron = (
    <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4l4 4 4-4"/>
    </svg>
  );

  const selectCls = "w-full h-9 appearance-none rounded-xl border border-gray-200 bg-white shadow-sm pl-3.5 pr-8 text-sm text-gray-700 focus:outline-none focus:border-blue-400 cursor-pointer";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-bold">Звонки</h1>
        {total > 0 && !loading && (
          <span className="text-sm text-gray-400">{from}–{to} из {total}</span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 mb-4">
        {/* Search — full width */}
        <div className="flex items-center rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden h-9">
          <svg className="ml-3 shrink-0 text-gray-400" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="8.5" cy="8.5" r="5.5"/><path d="M14 14l4 4"/>
          </svg>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            placeholder="Тема или телефон…"
            className="pl-2 pr-3 h-full text-sm text-gray-800 placeholder-gray-400 focus:outline-none flex-1 bg-transparent"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }} className="mr-2 text-gray-300 hover:text-gray-500 transition-colors">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l10 10M11 1L1 11"/></svg>
            </button>
          )}
        </div>

        {/* Dropdowns row */}
        <div className="flex flex-wrap gap-2">
          {managers.length > 0 && (
            <SelectWrapper>
              <select value={manager} onChange={(e) => changeFilter(setManager)(e.target.value)} className={selectCls}>
                <option value="all">Все менеджеры</option>
                {managers.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {chevron}
            </SelectWrapper>
          )}

          <SelectWrapper>
            <select value={resultF} onChange={(e) => changeFilter(setResultF)(e.target.value)} className={selectCls}>
              <option value="all">Любой итог</option>
              <option value="green">Положительный</option>
              <option value="yellow">Нейтральный</option>
              <option value="red">Негативный</option>
            </select>
            {chevron}
          </SelectWrapper>

          <SelectWrapper>
            <select value={hasArticle} onChange={(e) => changeFilter(setHasArticle)(e.target.value)} className={selectCls}>
              <option value="all">Все статьи</option>
              <option value="yes">Есть статья</option>
              <option value="no">Без статьи</option>
            </select>
            {chevron}
          </SelectWrapper>

          {hasActiveFilters && (
            <button
              onClick={() => { setSearch(""); setSearchInput(""); setResultF("all"); setHasArticle("all"); setManager("all"); setPage(1); }}
              className="h-9 flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white shadow-sm px-3 text-sm text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors whitespace-nowrap"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M1 1l10 10M11 1L1 11"/>
              </svg>
              Сбросить
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-2">
        {loading && <p className="py-8 text-center text-gray-400">Загрузка…</p>}
        {!loading && transcripts.length === 0 && !error && (
          <p className="py-8 text-center text-gray-400">Ничего не найдено</p>
        )}
        {transcripts.map((t) => (
          <div key={t.id} className="rounded-xl border border-gray-200 bg-white shadow-sm p-3.5">
            {/* Top: date + result */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">{formatDate(t.call_date)}</span>
              <div className="flex items-center gap-1.5">
                <ResultDot type={t.result_type} />
                <span className="text-xs text-gray-400">{RESULT_LABELS[t.result_type] ?? "—"}</span>
              </div>
            </div>

            {/* Subject */}
            <div className="font-medium text-gray-800 text-sm leading-snug line-clamp-2 mb-1">{t.subject}</div>
            <div className="text-xs text-gray-400 mb-2.5">{t.phone}</div>

            {/* Manager + size */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500 bg-gray-50 rounded-md px-2 py-0.5 border border-gray-100">
                {t.manager_name || "—"}
              </span>
              {t.transcript_len > 0 && (
                <span className="text-xs text-gray-400">
                  {Math.round(t.transcript_len / 100) / 10} кб
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {t.transcript_len > 0 && (
                <Link
                  href={`/transcripts/${t.id}`}
                  className="flex-1 text-center rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  Читать
                </Link>
              )}
              {t.has_article ? (
                <Link
                  href="/articles"
                  className="flex-1 text-center rounded-lg border border-blue-100 bg-blue-50 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
                >
                  Готова →
                </Link>
              ) : t.transcript_len > 100 ? (
                <button
                  onClick={() => handleGenerate(t)}
                  disabled={generating === t.id}
                  className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait transition-colors"
                >
                  {generating === t.id ? "Генерация…" : "Создать статью"}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
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
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(t.call_date)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800 line-clamp-1">{t.subject}</div>
                  <div className="text-xs text-gray-400">{t.phone}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{t.manager_name}</td>
                <td className="px-4 py-3 text-center">
                  <ResultDot type={t.result_type} />
                </td>
                <td className="px-4 py-3 text-right text-gray-400">
                  {t.transcript_len ? `${Math.round(t.transcript_len / 100) / 10} кб` : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  {t.transcript_len > 0 ? (
                    <Link href={`/transcripts/${t.id}`} className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
                      Читать
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {t.has_article ? (
                    <Link href="/articles" className="text-xs text-blue-600 hover:underline">Готова →</Link>
                  ) : t.transcript_len > 100 ? (
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

        {loading && <p className="p-8 text-center text-gray-400">Загрузка…</p>}
        {!loading && transcripts.length === 0 && !error && (
          <p className="p-8 text-center text-gray-400">Ничего не найдено</p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 gap-2">
          <span className="text-sm text-gray-400 shrink-0">
            <span className="hidden sm:inline">Страница </span>{page} / {totalPages}
          </span>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            <button onClick={() => setPage(1)} disabled={page === 1}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Первая">«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="rounded-lg border border-gray-200 bg-white px-2.5 sm:px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">‹</button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | "…")[]>((acc, p, i, arr) => {
                if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`e${i}`} className="px-1 text-gray-400 text-sm">…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p as number)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      page === p ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}>{p}</button>
                )
              )}

            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="rounded-lg border border-gray-200 bg-white px-2.5 sm:px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Последняя">»</button>
          </div>
        </div>
      )}
    </div>
  );
}
