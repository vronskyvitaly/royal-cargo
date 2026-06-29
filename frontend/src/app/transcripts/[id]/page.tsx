"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, type Transcript } from "@/lib/api";

export default function TranscriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.transcripts.get(Number(id)).then(setTranscript);
  }, [id]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const article = await api.articles.generate(Number(id));
      router.push(`/articles/${article.id}`);
    } catch (e) {
      setError(String(e));
      setGenerating(false);
    }
  }

  if (!transcript) {
    return <p className="text-gray-400 p-8 text-center">Загрузка…</p>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link href="/transcripts" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Назад
        </Link>
        {transcript.has_article ? (
          <Link
            href="/articles"
            className="rounded-full bg-green-50 border border-green-200 px-4 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100"
          >
            Статья готова →
          </Link>
        ) : transcript.transcript_raw ? (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait"
          >
            {generating ? "Генерация статьи…" : "Создать статью"}
          </button>
        ) : null}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Мета */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 mb-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-400 text-xs uppercase">Дата</span>
          <p className="font-medium text-gray-800 mt-0.5">
            {new Date(transcript.call_date).toLocaleString("ru-RU")}
          </p>
        </div>
        <div>
          <span className="text-gray-400 text-xs uppercase">Телефон</span>
          <p className="font-medium text-gray-800 mt-0.5">{transcript.phone}</p>
        </div>
        <div>
          <span className="text-gray-400 text-xs uppercase">Менеджер</span>
          <p className="font-medium text-gray-800 mt-0.5">{transcript.manager_name}</p>
        </div>
        {transcript.lead_url && (
          <div>
            <span className="text-gray-400 text-xs uppercase">Лид в Bitrix</span>
            <p className="mt-0.5">
              <a
                href={transcript.lead_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                Открыть лид #{transcript.lead_id}
              </a>
            </p>
          </div>
        )}
        <div className="col-span-2">
          <span className="text-gray-400 text-xs uppercase">Тема</span>
          <p className="font-medium text-gray-800 mt-0.5">{transcript.subject}</p>
        </div>
      </div>

      {/* Резюме */}
      {transcript.summary && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 mb-4">
          <h2 className="text-xs font-semibold text-blue-600 uppercase mb-2">Резюме звонка</h2>
          <p className="text-sm text-blue-900 whitespace-pre-wrap">{transcript.summary}</p>
        </div>
      )}

      {/* Транскрипт */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase">Расшифровка</h2>
        </div>
        <div className="p-5">
          {transcript.transcript_raw ? (
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
              {transcript.transcript_raw}
            </pre>
          ) : (
            <p className="text-gray-400 text-sm">Расшифровка отсутствует</p>
          )}
        </div>
      </div>
    </div>
  );
}
