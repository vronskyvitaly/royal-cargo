"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getToken } from "@/lib/auth";

const BASE = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
const SUPER_ADMIN = "vronskyvitaly@mail.ru";

function api(method: string, path: string, body?: unknown) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

interface Employee {
  id: number; email: string; name: string; role: string; position: string | null;
}

const ROLE_LABELS: Record<string, string> = { admin: "Администратор", editor: "Редактор" };

export default function ProfilePage() {
  const { user, signIn } = useAuth();
  const isSuperAdmin = user?.email === SUPER_ADMIN;
  const isAdmin = user?.role === "admin";

  // Own profile
  const [name, setName] = useState(user?.name ?? "");
  const [position, setPosition] = useState("");
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPwd, setSavingPwd] = useState(false);

  // App secret (super admin)
  const [appSecret, setAppSecret] = useState("");
  const [secretMsg, setSecretMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingSecret, setSavingSecret] = useState(false);

  // Employees (admin)
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editingEmployee, setEditingEmployee] = useState<number | null>(null);
  const [empForm, setEmpForm] = useState<{ role: string; position: string }>({ role: "", position: "" });
  const [empMsg, setEmpMsg] = useState<string | null>(null);

  useEffect(() => {
    api("GET", "/api/profile").then((r) => r.json()).then((p) => {
      if (p) { setName(p.name); setPosition(p.position ?? ""); }
    });
    if (isAdmin) {
      api("GET", "/api/profile/users").then((r) => r.json()).then(setEmployees);
    }
  }, [isAdmin]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    const r = await api("PUT", "/api/profile", { name, position });
    const data = await r.json();
    if (r.ok) {
      setProfileMsg({ ok: true, text: "Профиль сохранён" });
      // Update auth context name
      const token = getToken()!;
      signIn(token, { ...user!, name: data.name });
    } else {
      setProfileMsg({ ok: false, text: data.error });
    }
    setSavingProfile(false);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) { setPwdMsg({ ok: false, text: "Пароли не совпадают" }); return; }
    setSavingPwd(true);
    setPwdMsg(null);
    const r = await api("PUT", "/api/profile/password", { current: currentPwd, next: newPwd });
    const data = await r.json();
    if (r.ok) {
      setPwdMsg({ ok: true, text: "Пароль изменён" });
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } else {
      setPwdMsg({ ok: false, text: data.error });
    }
    setSavingPwd(false);
  }

  async function saveSecret(e: React.FormEvent) {
    e.preventDefault();
    setSavingSecret(true);
    setSecretMsg(null);
    const r = await api("PUT", "/api/profile/app-secret", { secret: appSecret });
    const data = await r.json();
    setSecretMsg(r.ok ? { ok: true, text: "Код доступа обновлён" } : { ok: false, text: data.error });
    if (r.ok) setAppSecret("");
    setSavingSecret(false);
  }

  function startEditEmployee(emp: Employee) {
    setEditingEmployee(emp.id);
    setEmpForm({ role: emp.role, position: emp.position ?? "" });
    setEmpMsg(null);
  }

  async function saveEmployee(id: number) {
    const r = await api("PUT", `/api/profile/users/${id}`, empForm);
    const data = await r.json();
    if (r.ok) {
      setEmployees((prev) => prev.map((e) => (e.id === id ? data : e)));
      setEditingEmployee(null);
    } else {
      setEmpMsg(data.error);
    }
  }

  const initials = (n: string) => n.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Профиль</h1>

      {/* Avatar + info */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md">
          <span className="text-xl font-bold text-white">{initials(name || user?.name || "?")}</span>
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-900">{name || user?.name}</p>
          <p className="text-sm text-gray-500">{user?.email}</p>
          <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
            user?.role === "admin" ? "bg-indigo-50 text-indigo-700" : "bg-gray-100 text-gray-600"
          }`}>
            {ROLE_LABELS[user?.role ?? "editor"]}
          </span>
        </div>
      </div>

      {/* Edit profile */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Личные данные</h2>
        <form onSubmit={saveProfile} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Имя и фамилия</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Должность</label>
            <input value={position} onChange={(e) => setPosition(e.target.value)}
              placeholder="Например: SEO-специалист"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none" />
          </div>
          {profileMsg && (
            <p className={`text-sm ${profileMsg.ok ? "text-green-600" : "text-red-600"}`}>{profileMsg.text}</p>
          )}
          <div className="flex justify-end">
            <button type="submit" disabled={savingProfile}
              className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {savingProfile ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </form>
      </div>

      {/* Change password */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Смена пароля</h2>
        <form onSubmit={savePassword} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Текущий пароль</label>
            <input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Новый пароль</label>
              <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Повторите</label>
              <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} required
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none" />
            </div>
          </div>
          {pwdMsg && (
            <p className={`text-sm ${pwdMsg.ok ? "text-green-600" : "text-red-600"}`}>{pwdMsg.text}</p>
          )}
          <div className="flex justify-end">
            <button type="submit" disabled={savingPwd}
              className="rounded-full bg-gray-800 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
              {savingPwd ? "Сохранение…" : "Изменить пароль"}
            </button>
          </div>
        </form>
      </div>

      {/* App secret — super admin only */}
      {isSuperAdmin && (
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-amber-700 mb-1">Код доступа к приложению</h2>
          <p className="text-xs text-gray-500 mb-4">Это общий секрет для входа и регистрации. После смены старый код перестанет работать немедленно.</p>
          <form onSubmit={saveSecret} className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Новый код (мин. 6 символов)</label>
              <input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} required
                placeholder="Введите новый код"
                className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm text-gray-800 focus:border-amber-400 focus:outline-none" />
            </div>
            <button type="submit" disabled={savingSecret}
              className="rounded-full bg-amber-500 px-5 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 shrink-0">
              {savingSecret ? "…" : "Сменить"}
            </button>
          </form>
          {secretMsg && (
            <p className={`mt-2 text-sm ${secretMsg.ok ? "text-green-600" : "text-red-600"}`}>{secretMsg.text}</p>
          )}
        </div>
      )}

      {/* Employees — admin only */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Сотрудники</h2>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Сотрудник</th>
                <th className="px-4 py-3 text-left">Должность</th>
                <th className="px-4 py-3 text-center">Права</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{emp.name}</p>
                    <p className="text-xs text-gray-400">{emp.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {editingEmployee === emp.id ? (
                      <input value={empForm.position}
                        onChange={(e) => setEmpForm((f) => ({ ...f, position: e.target.value }))}
                        placeholder="Должность"
                        className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none" />
                    ) : (
                      <span className="text-gray-600">{emp.position ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editingEmployee === emp.id ? (
                      <select value={empForm.role}
                        onChange={(e) => setEmpForm((f) => ({ ...f, role: e.target.value }))}
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none">
                        <option value="editor">Редактор</option>
                        <option value="admin">Администратор</option>
                      </select>
                    ) : (
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        emp.role === "admin" ? "bg-indigo-50 text-indigo-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {ROLE_LABELS[emp.role]}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingEmployee === emp.id ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => saveEmployee(emp.id)}
                          className="text-xs font-medium text-indigo-600 hover:underline">Сохранить</button>
                        <button onClick={() => setEditingEmployee(null)}
                          className="text-xs text-gray-400 hover:text-gray-600">Отмена</button>
                      </div>
                    ) : (
                      <button onClick={() => startEditEmployee(emp)}
                        className="text-xs text-gray-400 hover:text-gray-700">Изменить</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {empMsg && <p className="px-4 py-2 text-sm text-red-600">{empMsg}</p>}
        </div>
      )}
    </div>
  );
}
