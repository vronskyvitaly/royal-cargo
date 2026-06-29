const BASE = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

export interface Transcript {
  id: number;
  lead_id: number;
  subject: string;
  call_date: string;
  manager_name: string;
  result_type: string;
  phone: string;
  transcript_len: number;
  has_article: boolean;
  transcript_raw?: string;
  summary?: string;
  lead_url?: string;
}

export interface Article {
  id: number;
  transcript_id: number | null;
  title: string;
  content: string;
  status: "draft" | "approved" | "rejected" | "published";
  platform: "wordpress" | "megagroup" | null;
  published_url: string | null;
  review_comment: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  transcript_subject?: string;
  call_date?: string;
  manager_name?: string;
}

export const api = {
  transcripts: {
    list: (): Promise<Transcript[]> =>
      fetch(`${BASE}/api/transcripts`).then((r) => r.json()),
    get: (id: number): Promise<Transcript> =>
      fetch(`${BASE}/api/transcripts/${id}`).then((r) => r.json()),
  },
  articles: {
    list: (): Promise<Article[]> =>
      fetch(`${BASE}/api/articles`).then((r) => r.json()),
    get: (id: number): Promise<Article> =>
      fetch(`${BASE}/api/articles/${id}`).then((r) => r.json()),
    generate: (transcriptId: number): Promise<Article> =>
      fetch(`${BASE}/api/articles/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptId }),
      }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: r.statusText }));
          throw new Error(err.error ?? r.statusText);
        }
        return r.json();
      }),
    update: (
      id: number,
      data: Partial<
        Pick<Article, "title" | "content" | "status" | "review_comment"> & {
          reviewedBy: string;
        }
      >
    ): Promise<Article> =>
      fetch(`${BASE}/api/articles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    publish: (
      id: number,
      platform: "wordpress" | "megagroup"
    ): Promise<Article> =>
      fetch(`${BASE}/api/articles/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: r.statusText }));
          throw new Error(err.error ?? r.statusText);
        }
        return r.json();
      }),
    delete: (id: number): Promise<void> =>
      fetch(`${BASE}/api/articles/${id}`, { method: "DELETE" }).then(() => undefined),
  },
};
