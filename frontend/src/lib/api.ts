import { getToken } from "./auth";

const BASE = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function get(path: string) {
  return fetch(`${BASE}${path}`, { headers: authHeaders() }).then((r) => r.json());
}

function post(path: string, body: unknown) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
}

function put(path: string, body: unknown) {
  return fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

function del(path: string) {
  return fetch(`${BASE}${path}`, { method: "DELETE", headers: authHeaders() });
}

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
  last_edited_by: string | null;
  created_at: string;
  updated_at: string;
  transcript_subject?: string;
  call_date?: string;
  manager_name?: string;
  history?: { id: number; user_name: string; action: string; created_at: string }[];
}

export interface ArticleComment {
  id: number;
  article_id: number;
  user_name: string;
  selected_text: string;
  comment_text: string;
  resolved: boolean;
  created_at: string;
}

export interface TranscriptFilters {
  page?: number;
  limit?: number;
  search?: string;
  result?: string;
  has_article?: "yes" | "no" | "all";
  manager?: string;
}

export interface TranscriptsPage {
  rows: Transcript[];
  total: number;
  page: number;
  limit: number;
}

export const api = {
  transcripts: {
    list: (filters?: TranscriptFilters): Promise<TranscriptsPage> => {
      const params = new URLSearchParams();
      if (filters?.page) params.set("page", String(filters.page));
      if (filters?.limit) params.set("limit", String(filters.limit));
      if (filters?.search) params.set("search", filters.search);
      if (filters?.result) params.set("result", filters.result);
      if (filters?.has_article) params.set("has_article", filters.has_article);
      if (filters?.manager) params.set("manager", filters.manager);
      const qs = params.toString();
      return get(`/api/transcripts${qs ? "?" + qs : ""}`);
    },
    managers: (): Promise<string[]> => get("/api/transcripts/managers"),
    get: (id: number): Promise<Transcript> => get(`/api/transcripts/${id}`),
  },
  articles: {
    list: (): Promise<Article[]> => get("/api/articles"),
    get: (id: number): Promise<Article> => get(`/api/articles/${id}`),
    generate: (transcriptId: number): Promise<Article> =>
      post("/api/articles/generate", { transcriptId }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: r.statusText }));
          throw new Error(err.error ?? r.statusText);
        }
        return r.json();
      }),
    update: (
      id: number,
      data: Partial<Pick<Article, "title" | "content" | "status" | "review_comment">>
    ): Promise<Article> => put(`/api/articles/${id}`, data),
    publish: (
      id: number,
      platform: "wordpress" | "megagroup"
    ): Promise<Article> =>
      post(`/api/articles/${id}/publish`, { platform }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: r.statusText }));
          throw new Error(err.error ?? r.statusText);
        }
        return r.json();
      }),
    delete: (id: number): Promise<void> =>
      del(`/api/articles/${id}`).then(() => undefined),
    unpublish: (id: number, reason: string): Promise<Article> =>
      post(`/api/articles/${id}/unpublish`, { reason }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: r.statusText }));
          throw new Error(err.error ?? r.statusText);
        }
        return r.json();
      }),
    comments: {
      list: (id: number): Promise<ArticleComment[]> => get(`/api/articles/${id}/comments`),
      add: (id: number, selectedText: string, commentText: string): Promise<ArticleComment> =>
        post(`/api/articles/${id}/comments`, { selectedText, commentText }).then((r) => r.json()),
      resolve: (id: number, commentId: number, resolved: boolean): Promise<ArticleComment> =>
        put(`/api/articles/${id}/comments/${commentId}`, { resolved }),
      remove: (id: number, commentId: number): Promise<void> =>
        del(`/api/articles/${id}/comments/${commentId}`).then(() => undefined),
    },
  },
};
