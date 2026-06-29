"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, type Article } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";

export default function ArticleEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [article, setArticle] = useState<Article | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [rejectComment, setRejectComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.articles.get(Number(id)).then((a) => {
      setArticle(a);
      setTitle(a.title);
      setContent(a.content);
    });
  }, [id]);

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const updated = await api.articles.update(Number(id), { title, content });
      setArticle(updated);
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
      const updated = await api.articles.update(Number(id), {
        status,
        reviewedBy: reviewerName || "Руководитель",
        ...(status === "rejected" ? { review_comment: rejectComment } : {}),
      });
      setArticle(updated);
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
      const updated = await api.articles.publish(Number(id), platform);
      setArticle(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    if (!confirm("Удалить статью?")) return;
    await api.articles.delete(Number(id));
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
          <Link href="/articles" className="text-gray-400 hover:text-gray-600 text-sm">
            ← Назад
          </Link>
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
              {new Date(article.call_date).toLocaleDateString("ru-RU")}
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
          <span className="text-xs text-gray-400 uppercase font-medium">Редактор</span>
          {isEditable && (
            <button
              onClick={save}
              disabled={loading}
              className="rounded-full bg-gray-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? "Сохранение…" : saved ? "Сохранено ✓" : "Сохранить"}
            </button>
          )}
        </div>

        <div className="p-4 space-y-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!isEditable}
            placeholder="Заголовок статьи"
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-lg font-semibold text-gray-800 focus:border-blue-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={!isEditable}
            rows={24}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-700 font-mono focus:border-blue-400 focus:outline-none resize-none disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>
      </div>

      {/* Preview */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 select-none">
          Предпросмотр HTML
        </summary>
        <div
          className="mt-3 rounded-xl border border-gray-200 bg-white p-6 text-gray-800
            [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:text-gray-900
            [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-gray-900
            [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-gray-800
            [&_p]:mb-4 [&_p]:leading-relaxed
            [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4
            [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4
            [&_li]:mb-1
            [&_strong]:font-semibold [&_strong]:text-gray-900"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </details>

      {/* Actions panel */}
      {article.status !== "published" && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Действия</h2>

          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">
              Имя рецензента
            </label>
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="Например: Александр Березнев"
              className="w-full max-w-sm rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none"
            />
          </div>

          {article.status === "draft" || article.status === "rejected" ? (
            <div className="flex flex-wrap gap-3 items-start">
              <button
                onClick={() => setStatus("approved")}
                disabled={!!actionLoading}
                className="rounded-full bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {actionLoading === "approved" ? "…" : "Одобрить"}
              </button>

              <div className="flex flex-col gap-2 flex-1 min-w-[260px]">
                <textarea
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  placeholder="Причина отклонения (необязательно)"
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-red-300 focus:outline-none resize-none"
                />
                <button
                  onClick={() => setStatus("rejected")}
                  disabled={!!actionLoading}
                  className="self-start rounded-full bg-red-50 border border-red-200 px-5 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  {actionLoading === "rejected" ? "…" : "Отклонить"}
                </button>
              </div>
            </div>
          ) : article.status === "approved" ? (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => publish("wordpress")}
                disabled={!!actionLoading}
                className="rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading === "publish-wordpress" ? "Публикация…" : "Опубликовать в WordPress"}
              </button>
              <button
                onClick={() => publish("megagroup")}
                disabled={!!actionLoading}
                className="rounded-full border border-blue-200 bg-blue-50 px-5 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {actionLoading === "publish-megagroup" ? "Публикация…" : "Опубликовать в Megagroup"}
              </button>
            </div>
          ) : null}

          {article.review_comment && (
            <div className="mt-4 rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-700">
              Комментарий: {article.review_comment}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
