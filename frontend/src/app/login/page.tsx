"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import AuthBackground from "@/components/AuthBackground";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await login(email, password, appSecret);
      signIn(token, user);
      router.replace("/transcripts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen flex items-center justify-center relative overflow-hidden">
      <AuthBackground />
      <div className="w-full max-w-sm relative" style={{ zIndex: 1 }}>
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 mb-4">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M3 17L8 8L13 14L16 11L19 17H3Z" fill="white" fillOpacity="0.85"/>
              <circle cx="16" cy="6" r="2.5" fill="white" fillOpacity="0.5"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white">Royal Cargo</h1>
          <p className="text-sm mt-1" style={{ color: "#7ba4d4" }}>Редакция SEO-статей</p>
        </div>

        {/* Form */}
        <div className="rounded-2xl p-8" style={{
          background: "rgba(15,25,45,0.75)",
          border: "1px solid rgba(59,130,246,0.18)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 8px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#7ba4d4", letterSpacing: "0.04em" }}>
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@royalcargo.ru"
                required
                autoFocus
                className="w-full rounded-lg px-3.5 py-2.5 text-base text-white placeholder-gray-600 focus:outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(59,130,246,0.25)" }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#7ba4d4", letterSpacing: "0.04em" }}>ПАРОЛЬ</label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-lg px-3.5 py-2.5 pr-10 text-base text-white placeholder-gray-600 focus:outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(59,130,246,0.25)" }}
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors" style={{ color: "#4a7aa8" }}>
                  <EyeIcon open={showPwd} />
                </button>
              </div>
            </div>

            <div className="pt-1" style={{ borderTop: "1px solid rgba(59,130,246,0.12)" }}>
              <label className="block text-xs font-medium mb-1.5 mt-3" style={{ color: "#7ba4d4", letterSpacing: "0.04em" }}>
                КОД ДОСТУПА
              </label>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder="Секретный код"
                  required
                  className="w-full rounded-lg px-3.5 py-2.5 pr-10 text-base text-white placeholder-gray-600 focus:outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(59,130,246,0.25)" }}
                />
                <button type="button" onClick={() => setShowSecret(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors" style={{ color: "#4a7aa8" }}>
                  <EyeIcon open={showSecret} />
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg px-3.5 py-2.5 text-sm" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 disabled:cursor-wait transition-all mt-2"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #2563eb)", boxShadow: "0 4px 24px rgba(37,99,235,0.4)" }}
            >
              {loading ? "Вход…" : "Войти"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: "#4a7aa8" }}>
          Нет аккаунта?{" "}
          <Link href="/register" className="font-medium hover:underline" style={{ color: "#60a5fa" }}>
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  );
}
