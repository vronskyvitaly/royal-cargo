"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getToken } from "@/lib/auth";

const BASE = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

interface User {
  id: number;
  email: string;
  name: string;
  role: "admin" | "editor";
  position: string | null;
  created_at: string;
}

function apiUsers(method: string, path: string, body?: unknown) {
  return fetch(`${BASE}/api/users${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function SwapIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-40 shrink-0">
      <path d="M2 4l3-3 3 3M8 8l-3 3-3-3"/>
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5"/>
      <path d="M21 2l-9.6 9.6M15.5 7.5l3 3"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-40 transition-opacity shrink-0">
      <path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z"/>
    </svg>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", email: "", password: "", role: "editor" });
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [resetId, setResetId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [roleLoading, setRoleLoading] = useState<number | null>(null);
  const [editPositionId, setEditPositionId] = useState<number | null>(null);
  const [positionInput, setPositionInput] = useState("");

  const isMe = (id: number) => Number(me?.id) === Number(id);

  useEffect(() => {
    if (me && me.role !== "admin") { router.replace("/transcripts"); return; }
    apiUsers("GET", "/").then((r) => r.json()).then(setUsers);
  }, [me, router]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    try {
      const r = await apiUsers("POST", "/", form);
      const data = await r.json();
      if (!r.ok) { setFormError(data.error); return; }
      setUsers((prev) => [...prev, data as User]);
      setForm({ name: "", email: "", password: "", role: "editor" });
    } finally {
      setCreating(false);
    }
  }

  async function deleteUser(id: number) {
    if (!confirm("Удалить пользователя?")) return;
    const r = await apiUsers("DELETE", `/${id}`);
    if (r.ok) setUsers((prev) => prev.filter((u) => u.id !== id));
    else setError("Ошибка удаления");
  }

  async function savePosition(id: number) {
    const r = await apiUsers("PUT", `/${id}/position`, { position: positionInput });
    if (r.ok) {
      const updated = await r.json() as User;
      setUsers((prev) => prev.map((u) => u.id === id ? updated : u));
      setEditPositionId(null);
    } else {
      const data = await r.json().catch(() => ({ error: "Ошибка" }));
      setError(data.error);
    }
  }

  async function changeRole(id: number, role: "admin" | "editor") {
    setRoleLoading(id);
    const r = await apiUsers("PUT", `/${id}/role`, { role });
    if (r.ok) {
      const updated = await r.json() as User;
      setUsers((prev) => prev.map((u) => u.id === id ? updated : u));
    } else {
      const data = await r.json().catch(() => ({ error: "Ошибка" }));
      setError(data.error);
    }
    setRoleLoading(null);
  }

  async function resetPassword(id: number) {
    if (!newPassword || newPassword.length < 6) { setError("Минимум 6 символов"); return; }
    const r = await apiUsers("PUT", `/${id}/password`, { password: newPassword });
    if (r.ok) { setResetId(null); setNewPassword(""); }
    else setError("Ошибка сброса пароля");
  }

  if (me?.role !== "admin") return null;

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Пользователи</h1>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="shrink-0 text-red-400"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.5a.75.75 0 011.5 0v4.25a.75.75 0 01-1.5 0V6.5zm.75 7a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/></svg>
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-500">✕</button>
        </div>
      )}

      {/* User list */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" style={{ minWidth: "640px" }}>
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Имя</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Должность</th>
                <th className="px-5 py-3.5 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">Роль</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, idx) => (
                <React.Fragment key={u.id}>
                  <tr
                    className={`transition-colors ${resetId === u.id ? "bg-indigo-50/50" : idx % 2 === 0 ? "bg-white hover:bg-gray-50/80" : "bg-gray-50/30 hover:bg-gray-50/80"}`}
                  >
                    {/* Name */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                          {u.name.charAt(0)}
                        </div>
                        <span className="font-medium text-gray-800">{u.name}</span>
                        {isMe(u.id) && (
                          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">Вы</span>
                        )}
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-5 py-4 text-gray-500">{u.email}</td>

                    {/* Position */}
                    <td className="px-5 py-4 min-w-[160px]">
                      {editPositionId === u.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            value={positionInput}
                            onChange={(e) => setPositionInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") savePosition(u.id);
                              if (e.key === "Escape") setEditPositionId(null);
                            }}
                            placeholder="Напр. SEO-специалист"
                            className="flex-1 rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                          />
                          <button onClick={() => savePosition(u.id)} className="text-indigo-500 hover:text-indigo-700 text-sm">✓</button>
                          <button onClick={() => setEditPositionId(null)} className="text-gray-300 hover:text-gray-500 text-sm">✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditPositionId(u.id); setPositionInput(u.position ?? ""); }}
                          className="group flex items-center gap-1.5 text-left w-full"
                        >
                          <span className={`text-sm ${u.position ? "text-gray-600" : "text-gray-300 italic"}`}>
                            {u.position ?? "Не указана"}
                          </span>
                          <PencilIcon />
                        </button>
                      )}
                    </td>

                    {/* Role */}
                    <td className="px-5 py-4 text-center">
                      {isMe(u.id) ? (
                        <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-indigo-100 text-indigo-700">
                          Администратор
                        </span>
                      ) : (
                        <button
                          onClick={() => changeRole(u.id, u.role === "admin" ? "editor" : "admin")}
                          disabled={roleLoading === u.id}
                          title="Сменить роль"
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all hover:ring-2 hover:ring-offset-1 disabled:opacity-50 cursor-pointer ${
                            u.role === "admin"
                              ? "bg-indigo-100 text-indigo-700 hover:ring-indigo-300"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:ring-gray-300"
                          }`}
                        >
                          {roleLoading === u.id ? "…" : u.role === "admin" ? "Администратор" : "Редактор"}
                          {roleLoading !== u.id && <SwapIcon />}
                        </button>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setResetId(resetId === u.id ? null : u.id);
                            setNewPassword("");
                            setError(null);
                          }}
                          title="Сменить пароль"
                          className={`p-2 rounded-lg transition-colors ${
                            resetId === u.id
                              ? "bg-indigo-100 text-indigo-600"
                              : "text-gray-400 hover:bg-gray-100 hover:text-indigo-600"
                          }`}
                        >
                          <KeyIcon />
                        </button>
                        {!isMe(u.id) && (
                          <button
                            onClick={() => deleteUser(u.id)}
                            title="Удалить"
                            className="p-2 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Password reset row */}
                  {resetId === u.id && (
                    <tr className="bg-indigo-50/60 border-t border-indigo-100">
                      <td colSpan={5} className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium text-indigo-600 shrink-0">
                            Новый пароль для {u.name}:
                          </span>
                          <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && resetPassword(u.id)}
                            placeholder="Минимум 6 символов"
                            autoFocus
                            className="flex-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                          />
                          <button
                            onClick={() => resetPassword(u.id)}
                            disabled={newPassword.length < 6}
                            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                          >
                            Сохранить
                          </button>
                          <button
                            onClick={() => { setResetId(null); setNewPassword(""); }}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                          >
                            Отмена
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create user form */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-5">Добавить пользователя</h2>
        <form onSubmit={createUser} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Имя</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Иван Петров"
              required
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="ivan@royalcargo.ru"
              required
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Пароль</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Минимум 6 символов"
              required
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Роль</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all bg-white"
            >
              <option value="editor">Редактор</option>
              <option value="admin">Администратор</option>
            </select>
          </div>

          {formError && (
            <div className="col-span-full rounded-xl bg-red-50 border border-red-100 px-3.5 py-2.5 text-sm text-red-600">
              {formError}
            </div>
          )}

          <div className="col-span-full flex justify-end pt-1">
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm shadow-indigo-200"
            >
              {creating ? "Создание…" : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
