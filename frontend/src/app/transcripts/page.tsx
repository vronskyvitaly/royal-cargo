"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import BidirectionalList, { type BidirectionalListProps } from "broad-infinite-list/react";
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
// Generous DOM window — old rows only get trimmed from memory after scrolling
// past ~8 pages worth of results; typical result sets never hit this.
const VIEW_COUNT = 200;

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

function SelectWrapper({ children }: { children: React.ReactNode }) {
  return <div className="relative flex-1 min-w-[130px]">{children}</div>;
}

const chevron = (
  <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4l4 4 4-4"/>
  </svg>
);

const selectCls = "w-full h-9 appearance-none rounded-xl border border-gray-200 bg-white shadow-sm pl-3.5 pr-8 text-sm text-gray-700 focus:outline-none focus:border-blue-400 cursor-pointer";

const spinnerRow = (
  <div className="flex items-center justify-center gap-2 py-6 text-gray-400">
    <svg className="animate-spin shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    </svg>
    <span className="text-sm">Загрузка…</span>
  </div>
);

const emptyState = <p className="py-8 text-center text-gray-400">Ничего не найдено</p>;

export default function TranscriptsPage() {
  const [items, setItems] = useState<Transcript[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [generating, setGenerating] = useState<number | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managers, setManagers] = useState<string[]>([]);

  const [search, setSearch]       = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [resultF, setResultF]     = useState("all");
  const [hasArticle, setHasArticle] = useState("all");
  const [manager, setManager]     = useState("all");

  const pageRef = useRef(1);
  const filtersRef = useRef<TranscriptFilters>({});

  const buildFilters = useCallback(
    (): TranscriptFilters => ({
      search: search || undefined,
      result: resultF !== "all" ? resultF : undefined,
      has_article: hasArticle !== "all" ? (hasArticle as "yes" | "no") : undefined,
      manager: manager !== "all" ? manager : undefined,
    }),
    [search, resultF, hasArticle, manager]
  );

  useEffect(() => {
    api.transcripts.managers().then(setManagers).catch(() => {});
  }, []);

  // Reload from the first page whenever filters change
  useEffect(() => {
    let cancelled = false;
    reload();
    return () => { cancelled = true; };

    function reload() {
      setLoadingInitial(true);
      setError(null);
      const filters = buildFilters();
      filtersRef.current = filters;
      pageRef.current = 1;
      api.transcripts
        .list({ ...filters, page: 1, limit: LIMIT })
        .then((data) => {
          if (cancelled) return;
          setItems(data.rows);
          setTotal(data.total);
          setLoadedCount(data.rows.length);
        })
        .catch((e: unknown) => !cancelled && setError(`Не удалось загрузить звонки: ${String(e)}`))
        .finally(() => !cancelled && setLoadingInitial(false));
    }
  }, [buildFilters]);

  useEffect(() => {
    const socket = getSocket();

    const onCreated = (article: Article) => {
      setGenerating((prev) => (prev === article.transcript_id ? null : prev));
      setItems((prev) =>
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
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch((prev) => (searchInput !== prev ? searchInput : prev));
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleLoadMore: BidirectionalListProps<Transcript>["onLoadMore"] = useCallback(async (direction) => {
    if (direction !== "down") return [];
    const nextPage = pageRef.current + 1;
    const data = await api.transcripts.list({ ...filtersRef.current, page: nextPage, limit: LIMIT });
    pageRef.current = nextPage;
    setTotal(data.total);
    setLoadedCount((c) => c + data.rows.length);
    return data.rows;
  }, []);

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

  const hasActiveFilters = search || resultF !== "all" || hasArticle !== "all" || manager !== "all";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-bold">Звонки</h1>
        {total > 0 && !loadingInitial && (
          <span className="text-sm text-gray-400">Загружено {loadedCount} из {total}</span>
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
            <button onClick={() => { setSearchInput(""); setSearch(""); }} className="mr-2 text-gray-300 hover:text-gray-500 transition-colors">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l10 10M11 1L1 11"/></svg>
            </button>
          )}
        </div>

        {/* Dropdowns row */}
        <div className="flex flex-wrap gap-2">
          {managers.length > 0 && (
            <SelectWrapper>
              <select value={manager} onChange={(e) => setManager(e.target.value)} className={selectCls}>
                <option value="all">Все менеджеры</option>
                {managers.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {chevron}
            </SelectWrapper>
          )}

          <SelectWrapper>
            <select value={resultF} onChange={(e) => setResultF(e.target.value)} className={selectCls}>
              <option value="all">Любой итог</option>
              <option value="green">Положительный</option>
              <option value="yellow">Нейтральный</option>
              <option value="red">Негативный</option>
            </select>
            {chevron}
          </SelectWrapper>

          <SelectWrapper>
            <select value={hasArticle} onChange={(e) => setHasArticle(e.target.value)} className={selectCls}>
              <option value="all">Все статьи</option>
              <option value="yes">Есть статья</option>
              <option value="no">Без статьи</option>
            </select>
            {chevron}
          </SelectWrapper>

          {hasActiveFilters && (
            <button
              onClick={() => { setSearch(""); setSearchInput(""); setResultF("all"); setHasArticle("all"); setManager("all"); }}
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

      {loadingInitial ? (
        <p className="py-8 text-center text-gray-400">Загрузка…</p>
      ) : (
        <BidirectionalList<Transcript>
          items={items}
          itemKey={(t) => t.id}
          onLoadMore={handleLoadMore}
          onItemsChange={setItems}
          hasPrevious={false}
          hasNext={loadedCount < total}
          viewCount={VIEW_COUNT}
          useWindow={true}
          itemClassName="contents"
          spinnerRow={spinnerRow}
          emptyState={emptyState}
          renderItem={(t) => (
            <>
              {/* Mobile card */}
              <div className="sm:hidden rounded-xl border border-gray-200 bg-white shadow-sm p-3.5 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">{formatDate(t.call_date)}</span>
                  <div className="flex items-center gap-1.5">
                    <ResultDot type={t.result_type} />
                    <span className="text-xs text-gray-400">{RESULT_LABELS[t.result_type] ?? "—"}</span>
                  </div>
                </div>

                <div className="font-medium text-gray-800 text-sm leading-snug line-clamp-2 mb-1">{t.subject}</div>
                <div className="text-xs text-gray-400 mb-2.5">{t.phone}</div>

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

                <div className="flex items-center gap-2">
                  {t.transcript_len > 0 && (
                    <Link
                      href={`/transcripts/${t.id}`}
                      className="flex-1 text-center rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      Читать
                    </Link>
                  )}
                  {t.lead_url && (
                    <a
                      href={t.lead_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      Лид
                    </a>
                  )}
                  {t.has_article ? (
                    <Link
                      href={t.article_id ? `/articles/${t.article_id}` : "/articles"}
                      className="flex-1 text-center rounded-lg border border-blue-100 bg-blue-50 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
                    >
                      Открыть →
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

              {/* Desktop row */}
              <div className="hidden sm:flex sm:items-center sm:gap-4 rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3 mb-2 hover:border-blue-200 transition-colors">
                <div className="w-24 shrink-0 text-xs text-gray-400 whitespace-nowrap">{formatDate(t.call_date)}</div>

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 line-clamp-1">{t.subject}</div>
                  <div className="text-xs text-gray-400">{t.phone}</div>
                </div>

                <div className="w-36 shrink-0 text-sm text-gray-600 truncate">{t.manager_name || "—"}</div>

                <div className="w-20 shrink-0 flex items-center justify-center">
                  <ResultDot type={t.result_type} />
                </div>

                <div className="w-16 shrink-0 text-right text-xs text-gray-400">
                  {t.transcript_len ? `${Math.round(t.transcript_len / 100) / 10} кб` : "—"}
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {t.transcript_len > 0 ? (
                    <Link href={`/transcripts/${t.id}`} className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
                      Читать
                    </Link>
                  ) : (
                    <span className="w-[68px] text-center text-xs text-gray-300">—</span>
                  )}

                  {t.lead_url && (
                    <a
                      href={t.lead_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      Лид
                    </a>
                  )}

                  <div className="w-32 flex justify-center">
                    {t.has_article ? (
                      <Link href={t.article_id ? `/articles/${t.article_id}` : "/articles"} className="text-xs text-blue-600 hover:underline">Открыть →</Link>
                    ) : t.transcript_len > 100 ? (
                      <button
                        onClick={() => handleGenerate(t)}
                        disabled={generating === t.id}
                        className="rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait"
                      >
                        {generating === t.id ? "Генерация…" : "Создать статью"}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300 whitespace-nowrap">Мало данных</span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        />
      )}
    </div>
  );
}
