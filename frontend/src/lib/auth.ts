const BASE = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

export interface User {
  id: number;
  email: string;
  name: string;
  role: "admin" | "editor";
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("rc_token");
}

export function setToken(token: string) {
  localStorage.setItem("rc_token", token);
}

export function clearToken() {
  localStorage.removeItem("rc_token");
}

export async function login(email: string, password: string, appSecret: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, appSecret }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Ошибка входа");
  }
  return res.json();
}

export async function fetchMe(token: string): Promise<User> {
  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Unauthorized");
  return res.json();
}
