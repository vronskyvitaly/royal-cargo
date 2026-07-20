import { getToken } from "./auth";

const BASE = "";

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

function patch(path: string, body: unknown) {
  return fetch(`${BASE}${path}`, {
    method: "PATCH",
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
  article_id?: number | null;
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
  all_reviewers?: string[];
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
  resolved_by?: string | null;
  created_at: string;
}

export interface Board {
  id: number;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  column_count?: number;
  card_count?: number;
  columns?: BoardColumn[];
  cards?: BoardCard[];
}

export interface BoardColumn {
  id: number;
  board_id: number;
  name: string;
  position: number;
  created_at: string;
}

export interface BoardCard {
  id: number;
  board_id: number;
  column_id: number;
  title: string;
  description: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  article_id: number | null;
}

export interface ArticleBoardCard extends BoardCard {
  board_name: string;
  column_name: string;
}

export interface ArticleSearchResult {
  id: number;
  title: string;
  status: "draft" | "approved" | "rejected" | "published";
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
    generate: (transcriptId: number): Promise<Article | null> =>
      post("/api/articles/generate", { transcriptId }).then(async (r) => {
        if (r.status === 202) return null; // generating in background, result via socket
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
        patch(`/api/articles/${id}/comments/${commentId}`, { resolved }),
      remove: (id: number, commentId: number): Promise<void> =>
        del(`/api/articles/${id}/comments/${commentId}`).then(() => undefined),
    },
  },
  boards: {
    list: (): Promise<Board[]> => get("/api/boards"),
    get: (id: number): Promise<Board> => get(`/api/boards/${id}`),
    create: (name: string, description?: string): Promise<Board> =>
      post("/api/boards", { name, description }).then((r) => r.json()),
    update: (id: number, data: { name?: string; description?: string }): Promise<Board> =>
      patch(`/api/boards/${id}`, data),
    delete: (id: number): Promise<void> =>
      del(`/api/boards/${id}`).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: r.statusText }));
          throw new Error(err.error ?? r.statusText);
        }
      }),
    cardByArticle: (articleId: number): Promise<ArticleBoardCard | null> =>
      get(`/api/boards/cards/by-article/${articleId}`),
    searchArticles: (q: string): Promise<ArticleSearchResult[]> =>
      get(`/api/boards/articles/search?q=${encodeURIComponent(q)}`),
    columns: {
      create: (boardId: number, name: string): Promise<BoardColumn> =>
        post(`/api/boards/${boardId}/columns`, { name }).then((r) => r.json()),
      rename: (boardId: number, columnId: number, name: string): Promise<BoardColumn> =>
        patch(`/api/boards/${boardId}/columns/${columnId}`, { name }),
      remove: (boardId: number, columnId: number): Promise<void> =>
        del(`/api/boards/${boardId}/columns/${columnId}`).then(async (r) => {
          if (!r.ok) {
            const err = await r.json().catch(() => ({ error: r.statusText }));
            throw new Error(err.error ?? r.statusText);
          }
        }),
      reorder: (boardId: number, columnIds: number[]): Promise<void> =>
        patch(`/api/boards/${boardId}/columns/reorder`, { columnIds }).then(() => undefined),
    },
    cards: {
      create: (
        boardId: number,
        columnId: number,
        title: string,
        description?: string,
        articleId?: number
      ): Promise<BoardCard> =>
        post(`/api/boards/${boardId}/cards`, { columnId, title, description, articleId }).then(async (r) => {
          if (!r.ok) {
            const err = await r.json().catch(() => ({ error: r.statusText }));
            throw new Error(err.error ?? r.statusText);
          }
          return r.json();
        }),
      update: (
        boardId: number,
        cardId: number,
        data: { title?: string; description?: string }
      ): Promise<BoardCard> => patch(`/api/boards/${boardId}/cards/${cardId}`, data),
      remove: (boardId: number, cardId: number): Promise<void> =>
        del(`/api/boards/${boardId}/cards/${cardId}`).then(() => undefined),
      move: (boardId: number, cardId: number, columnId: number, cardIds: number[]): Promise<void> =>
        patch(`/api/boards/${boardId}/cards/${cardId}/move`, { columnId, cardIds }).then(() => undefined),
    },
  },
};
