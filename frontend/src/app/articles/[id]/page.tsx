"use client";
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Article, type ArticleComment } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { getSocket } from "@/lib/socket";

export default function ArticleEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();

  const [article, setArticle] = useState<Article | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [rejectComment, setRejectComment] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [showReturn, setShowReturn] = useState(false);
  const [unpublishReason, setUnpublishReason] = useState("");
  const [showUnpublish, setShowUnpublish] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedTitle, setSavedTitle] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [previewEditing, setPreviewEditing] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Inline comments
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [selectionInfo, setSelectionInfo] = useState<{ text: string; x: number; y: number } | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [addingComment, setAddingComment] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  function applyHighlights(container: HTMLElement, activeComments: ArticleComment[]) {
    // Remove old highlights without disturbing content
    container.querySelectorAll("mark[data-cid]").forEach((el) => {
      const parent = el.parentNode!;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });

    for (const c of activeComments.filter((c) => !c.resolved)) {
      const searchText = c.selected_text;
      // Collect all text nodes
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      let n: Node | null;
      while ((n = walker.nextNode())) textNodes.push(n as Text);

      // Build concatenated text to find position
      let full = "";
      const offsets: { node: Text; start: number }[] = [];
      for (const tn of textNodes) {
        offsets.push({ node: tn, start: full.length });
        full += tn.textContent ?? "";
      }

      const idx = full.indexOf(searchText);
      if (idx === -1) continue;
      const end = idx + searchText.length;

      const range = document.createRange();
      let startSet = false;
      for (let i = 0; i < offsets.length; i++) {
        const { node, start } = offsets[i];
        const nodeEnd = start + (node.textContent?.length ?? 0);
        if (!startSet && start <= idx && idx < nodeEnd) {
          range.setStart(node, idx - start);
          startSet = true;
        }
        if (startSet && start < end && end <= nodeEnd) {
          range.setEnd(node, end - start);
          break;
        }
      }

      try {
        const mark = document.createElement("mark");
        mark.dataset.cid = String(c.id);
        mark.style.cssText = "background:#fef08a;border-radius:2px;cursor:pointer;";
        mark.title = `${c.user_name}: ${c.comment_text}`;
        range.surroundContents(mark);
      } catch {
        // selection spans tags — skip visual highlight for this comment
      }
    }
  }

  useEffect(() => {
    if (!previewEditing && previewRef.current) {
      previewRef.current.innerHTML = content;
      applyHighlights(previewRef.current, comments);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, previewEditing, comments]);

  function enterPreviewEdit() {
    setPreviewEditing(true);
    setTimeout(() => {
      if (previewRef.current) {
        previewRef.current.innerHTML = content;
        previewRef.current.focus();
      }
    }, 0);
  }

  function exitPreviewEdit() {
    if (previewRef.current) {
      setContent(previewRef.current.innerHTML);
      const h1Text = previewRef.current.querySelector("h1")?.textContent?.trim();
      if (h1Text) setTitle(h1Text);
    }
    setPreviewEditing(false);
  }

  useEffect(() => {
    const nid = Number(id);
    api.articles.get(nid).then((a) => {
      setArticle(a);
      setTitle(a.title);
      setContent(a.content);
      setSavedTitle(a.title);
      setSavedContent(a.content);
    });
    api.articles.comments.list(nid).then(setComments);
  }, [id]);

  // Live comment sync — other users' comments appear without a refresh
  useEffect(() => {
    const socket = getSocket();
    const numId = Number(id);

    const onCommentAdded = (comment: ArticleComment) => {
      if (comment.article_id !== numId) return;
      setComments((prev) => (prev.some((c) => c.id === comment.id) ? prev : [...prev, comment]));
    };

    const onCommentResolved = (comment: ArticleComment) => {
      if (comment.article_id !== numId) return;
      setComments((prev) => prev.map((c) => (c.id === comment.id ? comment : c)));
    };

    const onCommentDeleted = ({ id: commentId, article_id }: { id: number; article_id: number }) => {
      if (article_id !== numId) return;
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    };

    socket.on("article:comment_added", onCommentAdded);
    socket.on("article:comment_resolved", onCommentResolved);
    socket.on("article:comment_deleted", onCommentDeleted);
    return () => {
      socket.off("article:comment_added", onCommentAdded);
      socket.off("article:comment_resolved", onCommentResolved);
      socket.off("article:comment_deleted", onCommentDeleted);
    };
  }, [id]);

  function handlePreviewMouseUp() {
    if (previewEditing) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text) { setSelectionInfo(null); return; }
    const range = sel!.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const previewRect = previewRef.current!.getBoundingClientRect();
    setSelectionInfo({
      text,
      x: rect.right - previewRect.left,
      y: rect.bottom - previewRect.top,
    });
    setCommentInput("");
    setAddingComment(false);
  }

  async function submitComment() {
    if (!selectionInfo || !commentInput.trim()) return;
    const c = await api.articles.comments.add(Number(id), selectionInfo.text, commentInput.trim());
    setComments((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
    setSelectionInfo(null);
    setCommentInput("");
    setAddingComment(false);
    window.getSelection()?.removeAllRanges();
  }

  async function resolveComment(commentId: number, resolved: boolean) {
    const updated = await api.articles.comments.resolve(Number(id), commentId, resolved);
    setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
  }

  async function deleteComment(commentId: number) {
    await api.articles.comments.remove(Number(id), commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }

  function scrollToMark(commentId: number) {
    const mark = previewRef.current?.querySelector<HTMLElement>(`mark[data-cid="${commentId}"]`);
    if (!mark) return;
    mark.scrollIntoView({ behavior: "smooth", block: "center" });
    mark.style.transition = "outline 0.1s";
    mark.style.outline = "2px solid #f59e0b";
    mark.style.borderRadius = "3px";
    setTimeout(() => { mark.style.outline = "none"; }, 1200);
  }

  async function reload() {
    const fresh = await api.articles.get(Number(id));
    setArticle(fresh);
    setTitle(fresh.title);
    setContent(fresh.content);
    setSavedTitle(fresh.title);
    setSavedContent(fresh.content);
  }

  async function save() {
    setLoading(true);
    setError(null);
    try {
      // Sync title → <h1> in content before saving
      const div = document.createElement("div");
      div.innerHTML = content;
      const h1 = div.querySelector("h1");
      if (h1) h1.textContent = title;
      const contentToSave = div.innerHTML;
      await api.articles.update(Number(id), { title, content: contentToSave });
      await reload();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(status: "approved" | "rejected") {
    setActionLoading(status);
    setError(null);
    try {
      await api.articles.update(Number(id), {
        status,
        ...(status === "rejected" ? { review_comment: rejectComment } : {}),
      });
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setActionLoading(null);
    }
  }

  async function returnToDraft() {
    setActionLoading("return");
    setError(null);
    try {
      await api.articles.update(Number(id), {
        status: "draft",
        ...(returnReason.trim() ? { review_comment: returnReason.trim() } : {}),
      });
      setReturnReason("");
      setShowReturn(false);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setActionLoading(null);
    }
  }

  async function unpublish() {
    if (!unpublishReason.trim()) return;
    setActionLoading("unpublish");
    setError(null);
    try {
      await api.articles.unpublish(Number(id), unpublishReason.trim());
      setUnpublishReason("");
      setShowUnpublish(false);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setActionLoading(null);
    }
  }

  async function publish(platform: "wordpress" | "megagroup") {
    setActionLoading(`publish-${platform}`);
    setError(null);
    try {
      await api.articles.publish(Number(id), platform);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setActionLoading(null);
    }
  }

  const isDirty =
    (article?.status === "draft" || article?.status === "rejected") &&
    (title !== savedTitle || content !== savedContent);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  async function handleDelete() {
    if (!confirm("Удалить статью?")) return;
    await api.articles.delete(Number(id));
    router.push("/articles");
  }

  function handleBack() {
    if (isDirty && !confirm("Есть несохранённые изменения. Уйти без сохранения?")) return;
    router.push("/articles");
  }

  if (!article) {
    return <p className="text-gray-400 p-8 text-center">Загрузка…</p>;
  }

  const isEditable = article.status === "draft" || article.status === "rejected";

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="text-gray-400 hover:text-gray-600 text-sm">
            ← Назад
          </button>
          <StatusBadge status={article.status} />
          {article.platform && (
            <span className="text-xs text-gray-500 capitalize bg-gray-100 rounded-full px-2 py-0.5">
              {article.platform}
            </span>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="text-xs text-red-400 hover:text-red-600"
        >
          Удалить
        </button>
      </div>

      {/* Source info */}
      {article.transcript_subject && (
        <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-700">
          Источник: <strong>{article.transcript_subject}</strong>
          {article.call_date && (
            <span className="ml-2 text-blue-400">
              {new Date(article.call_date).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Published URL */}
      {article.published_url && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm">
          Опубликовано:{" "}
          <a
            href={article.published_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline break-all"
          >
            {article.published_url}
          </a>
        </div>
      )}

      {/* Editor */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 uppercase font-medium">Редактор</span>
            {article.last_edited_by && (
              <span className="text-xs text-gray-400">
                Последнее изменение:{" "}
                <span className="font-medium text-gray-600">{article.last_edited_by}</span>
                {article.updated_at && (
                  <span className="ml-1 text-gray-400">
                    · {new Date(article.updated_at).toLocaleString("ru-RU", {
                      day: "2-digit", month: "2-digit",
                      hour: "2-digit", minute: "2-digit",
                      timeZone: "Europe/Moscow",
                    })}
                  </span>
                )}
              </span>
            )}
          </div>
          {isEditable && (
            <div className="flex items-center gap-2">
              {isDirty && !loading && !saved && (
                <span className="text-xs text-orange-500 font-medium flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400" />
                  Не сохранено
                </span>
              )}
              <button
                onClick={save}
                disabled={loading}
                className="rounded-full bg-gray-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {loading ? "Сохранение…" : saved ? "Сохранено ✓" : "Сохранить"}
              </button>
            </div>
          )}
        </div>

        <div className="p-4 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              // Live update h1 in preview without changing content state
              if (previewRef.current && !previewEditing) {
                const h1 = previewRef.current.querySelector("h1");
                if (h1) h1.textContent = e.target.value;
              }
            }}
            disabled={!isEditable}
            placeholder="Заголовок статьи"
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-lg font-semibold text-gray-800 focus:border-blue-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
          />

          {/* HTML source — collapsed by default */}
          <details className="group/html">
            <summary className="flex items-center justify-between cursor-pointer select-none rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 px-3 py-2 transition-colors">
              <span className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                <svg
                  className="w-3 h-3 transition-transform duration-200 group-open/html:rotate-90 text-gray-400"
                  viewBox="0 0 12 12" fill="none"
                >
                  <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                HTML-код
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard.writeText(content);
                }}
                className="text-xs text-gray-500 hover:text-gray-800 bg-white border border-gray-200 hover:border-gray-300 rounded-full px-3 py-1 transition-colors"
              >
                Скопировать HTML
              </button>
            </summary>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!isEditable}
              rows={20}
              className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-700 font-mono focus:border-blue-400 focus:outline-none resize-y disabled:bg-gray-50 disabled:text-gray-500"
            />
          </details>
        </div>
      </div>

      {/* Preview + Comments */}
      <div className="mt-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500">Предпросмотр HTML</span>
          <div className="flex items-center gap-2">
            {comments.some((c) => c.resolved) && (
              <button
                onClick={() => setShowResolved((v) => !v)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                {showResolved ? "Скрыть решённые" : `Решённые (${comments.filter((c) => c.resolved).length})`}
              </button>
            )}
            {isEditable && (
              previewEditing ? (
                <button onClick={exitPreviewEdit}
                  className="text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-full px-3 py-1">
                  Готово
                </button>
              ) : (
                <button onClick={enterPreviewEdit}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 rounded-full px-3 py-1.5 transition-colors shadow-sm">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M7.5 1.5l2 2L3 10H1V8L7.5 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Редактировать
                </button>
              )
            )}
          </div>
        </div>

        {/* Preview — full width, comments float outside to the right */}
        <div className="relative">
          <div
            ref={previewRef}
            contentEditable={previewEditing}
            suppressContentEditableWarning
            onMouseUp={handlePreviewMouseUp}
            className={`rounded-xl border bg-white p-6 text-gray-800 select-text
              [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:text-gray-900
              [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-gray-900
              [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-gray-800
              [&_p]:mb-4 [&_p]:leading-relaxed
              [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4
              [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4
              [&_li]:mb-1
              [&_strong]:font-semibold [&_strong]:text-gray-900
              ${previewEditing
                ? "border-indigo-300 ring-2 ring-indigo-100 outline-none cursor-text"
                : "border-gray-200"
              }`}
          />

          {/* Floating comment button — appears near selection */}
          {selectionInfo && !previewEditing && (
            <div
              className="absolute z-20"
              style={{ left: selectionInfo.x + 8, top: selectionInfo.y + 4 }}
            >
              {!addingComment ? (
                <button
                  onMouseDown={(e) => { e.preventDefault(); setAddingComment(true); setTimeout(() => commentInputRef.current?.focus(), 50); }}
                  className="flex items-center gap-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium px-3 py-1.5 shadow-lg hover:bg-gray-700 whitespace-nowrap"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1 1h10v7H6.5L4 11V8H1V1z" stroke="white" strokeWidth="1.2" fill="none"/>
                  </svg>
                  Комментарий
                </button>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-white shadow-xl p-3 w-64">
                  <p className="text-xs text-gray-400 mb-2 line-clamp-2 italic border-l-2 border-yellow-400 pl-2">
                    «{selectionInfo.text}»
                  </p>
                  <textarea
                    ref={commentInputRef}
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitComment();
                      if (e.key === "Escape") { setAddingComment(false); setSelectionInfo(null); }
                    }}
                    placeholder="Что нужно изменить?"
                    rows={3}
                    className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:border-yellow-400"
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => { setAddingComment(false); setSelectionInfo(null); }} className="text-xs text-gray-400 hover:text-gray-600">Отмена</button>
                    <button
                      onMouseDown={(e) => { e.preventDefault(); submitComment(); }}
                      disabled={!commentInput.trim()}
                      className="text-xs font-medium bg-yellow-400 hover:bg-yellow-500 text-gray-900 px-3 py-1 rounded-lg disabled:opacity-40"
                    >
                      Добавить
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Comments panel — desktop: absolute right; mobile: hidden here (shown below) */}
          {comments.filter((c) => !c.resolved || showResolved).length > 0 && (
            <div className="hidden lg:block absolute top-0 left-[calc(100%+16px)] w-72 space-y-2">
              {comments
                .filter((c) => !c.resolved || showResolved)
                .map((c) => (
                  <div key={c.id} onClick={() => scrollToMark(c.id)} className={`rounded-xl border p-3 text-sm shadow-sm cursor-pointer ${c.resolved ? "border-gray-100 bg-gray-50 opacity-60" : "border-yellow-200 bg-yellow-50 hover:border-yellow-400"}`}>
                    <blockquote className="border-l-2 border-yellow-400 pl-2 text-xs text-gray-500 italic mb-2 line-clamp-2">
                      «{c.selected_text}»
                    </blockquote>
                    <p className="text-gray-800 mb-2">{c.comment_text}</p>
                    {c.resolved && c.resolved_by && (
                      <p className="text-xs text-green-600 mb-1.5">✓ Выполнил: {c.resolved_by}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-gray-600 text-xs">{c.user_name}</span>
                        <span className="text-gray-400 text-xs ml-1">
                          · {new Date(c.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={(e) => { e.stopPropagation(); resolveComment(c.id, !c.resolved); }} title={c.resolved ? "Открыть снова" : "Решено"} className="text-xs text-gray-400 hover:text-green-600">
                          {c.resolved ? "↩" : "✓"}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteComment(c.id); }} className="text-xs text-gray-300 hover:text-red-400">✕</button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Mobile comments — below preview */}
        {comments.filter((c) => !c.resolved || showResolved).length > 0 && (
          <div className="lg:hidden mt-3 space-y-2">
            {comments
              .filter((c) => !c.resolved || showResolved)
              .map((c) => (
                <div key={c.id} onClick={() => scrollToMark(c.id)} className={`rounded-xl border p-3 text-sm shadow-sm cursor-pointer ${c.resolved ? "border-gray-100 bg-gray-50 opacity-60" : "border-yellow-200 bg-yellow-50 hover:border-yellow-400"}`}>
                  <blockquote className="border-l-2 border-yellow-400 pl-2 text-xs text-gray-500 italic mb-2 line-clamp-2">
                    «{c.selected_text}»
                  </blockquote>
                  <p className="text-gray-800 mb-2">{c.comment_text}</p>
                  {c.resolved && c.resolved_by && (
                    <p className="text-xs text-green-600 mb-1.5">✓ Выполнил: {c.resolved_by}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-600 text-xs">{c.user_name}</span>
                      <span className="text-gray-400 text-xs ml-1">
                        · {new Date(c.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={(e) => { e.stopPropagation(); resolveComment(c.id, !c.resolved); }} title={c.resolved ? "Открыть снова" : "Решено"} className="text-xs text-gray-400 hover:text-green-600">
                        {c.resolved ? "↩" : "✓"}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteComment(c.id); }} className="text-xs text-gray-300 hover:text-red-400">✕</button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}

        {!previewEditing && comments.filter((c) => !c.resolved).length === 0 && (
          <p className="mt-2 text-xs text-gray-400">Выделите текст в превью чтобы оставить комментарий</p>
        )}
      </div>

      {/* History */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">История изменений</span>
          {article.history && article.history.length > 0 && (
            <span className="text-xs text-gray-300">{article.history.length} событий</span>
          )}
        </div>
        {!article.history || article.history.length === 0 ? (
          <p className="px-5 py-5 text-sm text-gray-400 italic">
            История появится после первого сохранения
          </p>
        ) : (
          <ol className="px-5 py-4 space-y-0">
            {article.history.map((h, i) => {
              const isLast = i === article.history!.length - 1;
              const isApprove = h.action.startsWith("Одобрил");
              const isReject = h.action.startsWith("Отклонил");
              const isPublish = h.action.startsWith("Опубликовал");
              const dotColor = isApprove
                ? "bg-green-400"
                : isReject
                ? "bg-red-400"
                : isPublish
                ? "bg-blue-400"
                : "bg-gray-300";
              return (
                <li key={h.id} className="relative flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
                    {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1" />}
                  </div>
                  <div className={`flex-1 flex items-start justify-between gap-3 ${!isLast ? "pb-4" : ""}`}>
                    <div>
                      <span className="text-sm font-medium text-gray-700">{h.user_name}</span>
                      <span className="text-sm text-gray-400"> · </span>
                      <span className={`text-sm ${isApprove ? "text-green-600" : isReject ? "text-red-500" : isPublish ? "text-blue-600" : "text-gray-500"}`}>
                        {h.action}
                      </span>
                    </div>
                    <time className="text-xs text-gray-400 shrink-0 tabular-nums pt-0.5">
                      {new Date(h.created_at).toLocaleString("ru-RU", {
                        day: "2-digit", month: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                        timeZone: "Europe/Moscow",
                      })}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Unpublish — admin only */}
      {article.status === "published" && user?.role === "admin" && (
        <div className="mt-4">
          {!showUnpublish ? (
            <button
              onClick={() => setShowUnpublish(true)}
              className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 rounded-lg px-3 py-1.5 transition-colors"
            >
              Отменить публикацию
            </button>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col gap-3">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Отменить публикацию</p>
              <p className="text-sm text-gray-600">
                Статья вернётся в статус <strong>«Одобрена»</strong>, ссылка на публикацию будет удалена.
              </p>
              <textarea
                value={unpublishReason}
                onChange={(e) => setUnpublishReason(e.target.value)}
                placeholder="Причина отмены (обязательно)"
                rows={2}
                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-red-400 focus:outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={unpublish}
                  disabled={!unpublishReason.trim() || actionLoading === "unpublish"}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === "unpublish" ? "Отмена…" : "Подтвердить отмену"}
                </button>
                <button
                  onClick={() => { setShowUnpublish(false); setUnpublishReason(""); }}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions panel */}
      {article.status !== "published" && (
        <div className="mt-4">
          {article.review_comment && (
            <div className="mb-3 rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 text-sm text-orange-700">
              <span className="font-medium">Комментарий рецензента:</span> {article.review_comment}
            </div>
          )}

          {(article.status === "draft" || article.status === "rejected") && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Approve */}
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex flex-col gap-3">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Одобрить</p>
                <p className="text-sm text-gray-600">
                  Одобряете как:{" "}
                  <span className="font-medium text-gray-800">{user?.name}</span>
                </p>
                <button
                  onClick={() => setStatus("approved")}
                  disabled={!!actionLoading}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === "approved" ? "Сохранение…" : "Одобрить статью"}
                </button>
              </div>

              {/* Reject */}
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col gap-3">
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wider">Отклонить</p>
                <textarea
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  placeholder="Причина (необязательно)"
                  rows={2}
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-red-400 focus:outline-none resize-none"
                />
                <button
                  onClick={() => setStatus("rejected")}
                  disabled={!!actionLoading}
                  className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === "rejected" ? "Сохранение…" : "Отклонить статью"}
                </button>
              </div>
            </div>
          )}

          {article.status === "approved" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Approve again */}
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex flex-col gap-3">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Одобрить</p>
                <p className="text-sm text-gray-600">
                  Одобряете как:{" "}
                  <span className="font-medium text-gray-800">{user?.name}</span>
                </p>
                <button
                  onClick={() => setStatus("approved")}
                  disabled={!!actionLoading}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === "approved" ? "Сохранение…" : "Одобрить статью"}
                </button>
              </div>

              {/* Publish */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex flex-col gap-3">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Публикация</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => publish("wordpress")}
                    disabled={!!actionLoading}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === "publish-wordpress" ? "Публикация…" : "WordPress"}
                  </button>
                  <button
                    onClick={() => publish("megagroup")}
                    disabled={!!actionLoading}
                    className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === "publish-megagroup" ? "Публикация…" : "Megagroup"}
                  </button>
                </div>
              </div>

              {/* Reject */}
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col gap-3">
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wider">Отклонить</p>
                <textarea
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  placeholder="Причина (необязательно)"
                  rows={2}
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-red-400 focus:outline-none resize-none"
                />
                <button
                  onClick={() => setStatus("rejected")}
                  disabled={!!actionLoading}
                  className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === "rejected" ? "Сохранение…" : "Отклонить статью"}
                </button>
              </div>
            </div>
          )}

          {/* Return to draft — admin only */}
          {user?.role === "admin" && (article.status === "approved" || article.status === "rejected") && (
            <div className="mt-3">
              {!showReturn ? (
                <button
                  onClick={() => setShowReturn(true)}
                  className="text-xs text-gray-400 hover:text-orange-500 border border-gray-200 hover:border-orange-300 rounded-lg px-3 py-1.5 transition-colors"
                >
                  ↩ Вернуть на доработку
                </button>
              ) : (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 flex flex-col gap-3">
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">Вернуть на доработку</p>
                  <p className="text-sm text-gray-600">
                    Статья вернётся в статус <strong>«Черновик»</strong> — редактор сможет вносить правки.
                  </p>
                  <textarea
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="Что нужно исправить? (необязательно)"
                    rows={2}
                    className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={returnToDraft}
                      disabled={actionLoading === "return"}
                      className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === "return" ? "Сохранение…" : "Вернуть на доработку"}
                    </button>
                    <button
                      onClick={() => { setShowReturn(false); setReturnReason(""); }}
                      className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
