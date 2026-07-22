"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useFloating,
  useHover,
  useClick,
  useDismiss,
  useInteractions,
  FloatingPortal,
  offset,
  flip,
  shift,
  autoUpdate,
} from "@floating-ui/react";
import { api, type Article, type ArticleDiscussionComment } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import StatusBadge from "@/components/StatusBadge";
import { initials } from "@/lib/format";

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  useEffect(() => {
    api.articles.list().then((data) => {
      setArticles(data);
      const stored = sessionStorage.getItem("articles:highlight");
      if (stored) {
        sessionStorage.removeItem("articles:highlight");
        const hid = Number(stored);
        setHighlightId(hid);
        // Double rAF: wait for React to commit the new rows and the browser to lay them out
        // before measuring scroll position — a single rAF is sometimes too early on long lists.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const candidates = document.querySelectorAll<HTMLElement>(`[data-article-id="${hid}"]`);
            const visible = Array.from(candidates).find((el) => el.offsetParent !== null);
            visible?.scrollIntoView({ behavior: "smooth", block: "center" });
          });
        });
        setTimeout(() => setHighlightId(null), 4500);
      }
    }).finally(() => setLoading(false));

    const socket = getSocket();

    const upsert = (article: Article) =>
      setArticles((prev) => {
        const idx = prev.findIndex((a) => a.id === article.id);
        return idx >= 0
          ? prev.map((a) => (a.id === article.id ? { ...a, ...article } : a))
          : [article, ...prev];
      });

    const onLikeToggled = ({ article_id, like_count }: { article_id: number; like_count: number }) =>
      setArticles((prev) => prev.map((a) => (a.id === article_id ? { ...a, like_count } : a)));

    const onDiscussionAdded = (comment: { article_id: number }) =>
      setArticles((prev) =>
        prev.map((a) => (a.id === comment.article_id ? { ...a, comment_count: (a.comment_count ?? 0) + 1 } : a))
      );

    const onDiscussionDeleted = ({ article_id }: { article_id: number }) =>
      setArticles((prev) =>
        prev.map((a) => (a.id === article_id ? { ...a, comment_count: Math.max(0, (a.comment_count ?? 1) - 1) } : a))
      );

    socket.on("article:created", upsert);
    socket.on("article:updated", upsert);
    socket.on("article:published", upsert);
    socket.on("article:deleted", ({ id }: { id: number }) =>
      setArticles((prev) => prev.filter((a) => a.id !== id))
    );
    socket.on("article:like_toggled", onLikeToggled);
    socket.on("article:discussion_added", onDiscussionAdded);
    socket.on("article:discussion_deleted", onDiscussionDeleted);
    return () => {
      socket.off("article:created");
      socket.off("article:updated");
      socket.off("article:published");
      socket.off("article:deleted");
      socket.off("article:like_toggled", onLikeToggled);
      socket.off("article:discussion_added", onDiscussionAdded);
      socket.off("article:discussion_deleted", onDiscussionDeleted);
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
          <div
            key={a.id}
            data-article-id={a.id}
            className={`rounded-xl border bg-white shadow-sm p-3.5 transition-colors duration-1000 ${
              highlightId === a.id ? "border-indigo-300 bg-indigo-50" : "border-gray-200"
            }`}
          >
            {/* Title */}
            <div className="font-medium text-gray-800 text-sm leading-snug line-clamp-2 mb-2">
              {a.title}
            </div>

            {/* Source + likes/comments */}
            <div className="flex items-center justify-between gap-2 mb-2.5">
              {a.transcript_subject ? (
                <div className="text-xs text-gray-400 line-clamp-1">
                  {a.transcript_subject}
                  {a.call_date && (
                    <span className="ml-1.5">
                      · {new Date(a.call_date).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}
                    </span>
                  )}
                </div>
              ) : <span />}
              <ArticleEngagement article={a} />
            </div>

            {/* Status row */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={a.status} />
                {(a.status === "approved" || a.status === "published") && (a.all_reviewers?.length ?? 0) > 0 && (
                  <ReviewersIndicator reviewers={a.all_reviewers!} />
                )}
                {a.reviewed_by && a.status === "rejected" && (
                  <span className="text-xs text-red-500">✕ {a.reviewed_by}</span>
                )}
              </div>
              <span className="shrink-0 whitespace-nowrap text-xs text-gray-400">
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
              <div className="flex items-center gap-1.5">
                {a.transcript_id && (
                  <Link
                    href={`/transcripts/${a.transcript_id}`}
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                  >
                    Читать
                  </Link>
                )}
                {a.lead_url && (
                  <a
                    href={a.lead_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                  >
                    Лид
                  </a>
                )}
                <Link
                  href={`/articles/${a.id}`}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  Открыть
                </Link>
              </div>
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
              <tr
                key={a.id}
                data-article-id={a.id}
                className={`transition-colors duration-1000 ${
                  highlightId === a.id ? "bg-indigo-50" : "hover:bg-gray-50"
                }`}
              >
                <td className="px-4 py-3 max-w-xs">
                  <span className="font-medium text-gray-800 line-clamp-2">{a.title}</span>
                  <div className="mt-1">
                    <ArticleEngagement article={a} />
                  </div>
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
                      <ReviewersIndicator reviewers={a.all_reviewers!} />
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
                  <div className="flex items-center justify-end gap-1.5">
                    {a.transcript_id && (
                      <Link
                        href={`/transcripts/${a.transcript_id}`}
                        className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                      >
                        Читать
                      </Link>
                    )}
                    {a.lead_url && (
                      <a
                        href={a.lead_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                      >
                        Лид
                      </a>
                    )}
                    <Link
                      href={`/articles/${a.id}`}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      Открыть
                    </Link>
                  </div>
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

function ReviewersIndicator({ reviewers, className }: { reviewers: string[]; className?: string }) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-start",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, { move: false, delay: { open: 80, close: 100 } });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, click, dismiss]);

  if (reviewers.length <= 2) {
    return <span className={`text-xs text-green-600 ${className ?? ""}`}>✓ {reviewers.join(", ")}</span>;
  }

  return (
    <>
      <span
        ref={refs.setReference}
        {...getReferenceProps()}
        className={`text-xs text-green-600 cursor-default whitespace-nowrap ${className ?? ""}`}
      >
        ✓ Одобрили ({reviewers.length})
      </span>

      {open && (
        <FloatingPortal>
          <div
            // eslint-disable-next-line react-hooks/refs -- refs.setFloating is a callback ref setter, the documented @floating-ui/react pattern
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-50 min-w-[170px] rounded-xl border border-gray-200 bg-white shadow-lg p-2 text-left"
          >
            <p className="px-1.5 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Одобрили</p>
            <div className="flex flex-col gap-1">
              {reviewers.map((name, i) => (
                <div key={`${name}-${i}`} className="flex items-center gap-2 px-1.5 py-1">
                  <div className="w-5 h-5 shrink-0 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-[9px] font-semibold">
                    {initials(name)}
                  </div>
                  <span className="text-xs text-gray-700 truncate">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function ArticleEngagement({ article }: { article: Article }) {
  return (
    <span className="shrink-0 flex items-center gap-2 text-xs text-gray-400">
      <LikesIndicator article={article} />
      <CommentsIndicator article={article} />
    </span>
  );
}

function LikesIndicator({ article }: { article: Article }) {
  const hasLikes = (article.liked_by?.length ?? 0) > 0;
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: open && hasLikes,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, { move: false, delay: { open: 80, close: 100 } });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover]);

  return (
    <>
      <span ref={refs.setReference} {...getReferenceProps()} className="flex items-center gap-1">
        <svg width="11" height="11" viewBox="0 0 20 20" fill={article.liked_by_me ? "currentColor" : "none"}
          stroke="currentColor" strokeWidth="1.8" className={article.liked_by_me ? "text-pink-500" : ""}>
          <path d="M10 17.5s-6.5-4.06-8.5-8.06C.36 6.6 1.7 3.5 4.7 3.1c1.7-.23 3.3.6 4.3 2.1 1-1.5 2.6-2.33 4.3-2.1 3 .4 4.34 3.5 3.2 6.34C16.5 13.44 10 17.5 10 17.5z" />
        </svg>
        {article.like_count ?? 0}
      </span>

      {open && hasLikes && (
        <FloatingPortal>
          <div
            // eslint-disable-next-line react-hooks/refs -- refs.setFloating is a callback ref setter, the documented @floating-ui/react pattern
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="hidden sm:block z-50 min-w-[160px] rounded-xl border border-gray-200 bg-white shadow-lg p-2 text-left"
          >
            <p className="px-1.5 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Понравилось</p>
            <div className="flex flex-col gap-1">
              {article.liked_by!.map((name, i) => (
                <div key={`${name}-${i}`} className="flex items-center gap-2 px-1.5 py-1">
                  <div className="w-5 h-5 shrink-0 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-[9px] font-semibold">
                    {initials(name)}
                  </div>
                  <span className="text-xs text-gray-700 truncate">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function CommentsIndicator({ article }: { article: Article }) {
  const hasComments = (article.comment_count ?? 0) > 0;
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<ArticleDiscussionComment[] | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: open && hasComments,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, { move: false, delay: { open: 80, close: 100 } });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover]);

  function loadComments() {
    if (comments !== null || loadingComments) return;
    setLoadingComments(true);
    api.articles.discussion.list(article.id).then((c) => {
      setComments(c);
      setLoadingComments(false);
    });
  }

  return (
    <>
      <span
        ref={refs.setReference}
        {...getReferenceProps({ onMouseEnter: loadComments })}
        className="flex items-center gap-1"
      >
        <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M17 10c0 3.31-3.13 6-7 6-1.02 0-1.98-.19-2.85-.53L3 17l1.18-3.54A5.6 5.6 0 013 10c0-3.31 3.13-6 7-6s7 2.69 7 6z" />
        </svg>
        {article.comment_count ?? 0}
      </span>

      {open && hasComments && (
        <FloatingPortal>
          <div
            // eslint-disable-next-line react-hooks/refs -- refs.setFloating is a callback ref setter, the documented @floating-ui/react pattern
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="hidden sm:block z-50 w-72 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg p-2.5 text-left"
          >
            <p className="px-1 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Обсуждение</p>
            {loadingComments ? (
              <p className="px-1 py-1 text-xs text-gray-400">Загрузка…</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {comments?.map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <div className="w-6 h-6 shrink-0 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[9px] font-semibold">
                      {initials(c.user_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-gray-800">{c.user_name}</span>
                      <div className="mt-0.5 rounded-lg rounded-tl-sm bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 whitespace-pre-wrap break-words line-clamp-4">
                        {c.comment_text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
