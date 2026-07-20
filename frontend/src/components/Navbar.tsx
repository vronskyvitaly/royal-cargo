"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const links = [
  { href: "/transcripts", label: "Звонки" },
  { href: "/articles", label: "Статьи" },
  { href: "/kanban", label: "Канбан" },
  { href: "/users", label: "Пользователи", adminOnly: true },
];

export default function Navbar() {
  const path = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();

  function handleSignOut() {
    signOut();
    router.replace("/login");
  }

  return (
    <nav
      className="sticky top-0 z-50 shrink-0 bg-[#111116] h-14 px-3 sm:px-5 flex items-center justify-between shadow-[0_1px_0_rgba(255,255,255,0.08),0_4px_24px_rgba(0,0,0,0.5)]"
      style={{ borderBottom: "1px solid rgba(99,102,241,0.25)" }}
    >
      {/* Logo + Nav */}
      <div className="flex items-center gap-2 sm:gap-6 min-w-0">
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 group-hover:shadow-indigo-500/40 transition-shadow">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 11L5 5.5L8 9L10 7L12 11H2Z" fill="white" fillOpacity="0.85"/>
              <circle cx="10" cy="4" r="1.5" fill="white" fillOpacity="0.5"/>
            </svg>
          </div>
          <span className="hidden xs:block text-white font-semibold text-sm tracking-tight">
            Royal Cargo
          </span>
        </Link>

        <div className="hidden sm:block w-px h-4 bg-white/10" />

        <div className="flex items-center gap-0.5">
          {links.filter((l) => !l.adminOnly || user?.role === "admin").map(({ href, label }) => {
            const active = path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all duration-150 ${
                  active
                    ? "text-indigo-300 bg-indigo-500/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <span className="text-xs text-gray-500 font-medium">онлайн</span>
        </div>
        <div className="hidden sm:block w-px h-4 bg-white/10" />
        {user && (
          <>
            <Link href="/profile" className="flex items-center gap-1.5 group">
              <div className="w-7 h-7 rounded-full bg-indigo-500/20 group-hover:bg-indigo-500/30 flex items-center justify-center transition-colors">
                <span className="text-[11px] font-semibold text-indigo-300">
                  {user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </span>
              </div>
              <span className="hidden sm:block text-xs text-gray-400 group-hover:text-gray-200 font-medium transition-colors">
                {user.name.split(" ")[0]}
              </span>
            </Link>
            <button
              onClick={handleSignOut}
              className="text-[11px] text-gray-600 hover:text-gray-300 font-medium tracking-wide transition-colors"
            >
              Выйти
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
