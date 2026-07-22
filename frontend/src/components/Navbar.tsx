"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { initials } from "@/lib/format";

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
  const [menuOpen, setMenuOpen] = useState(false);

  function handleSignOut() {
    setMenuOpen(false);
    signOut();
    router.replace("/login");
  }

  const visibleLinks = links.filter((l) => !l.adminOnly || user?.role === "admin");

  return (
    <nav
      className="relative sticky top-0 z-50 shrink-0 bg-[#111116] h-14 px-3 sm:px-5 flex items-center justify-between shadow-[0_1px_0_rgba(255,255,255,0.08),0_4px_24px_rgba(0,0,0,0.5)]"
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

        <div className="hidden md:block w-px h-4 bg-white/10" />

        <div className="hidden md:flex items-center gap-0.5">
          {visibleLinks.map(({ href, label }) => {
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
        <div className="hidden md:flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <span className="text-xs text-gray-500 font-medium">онлайн</span>
        </div>
        <div className="hidden md:block w-px h-4 bg-white/10" />
        {user && (
          <>
            <Link href="/profile" className="hidden md:flex items-center gap-1.5 group">
              <div className="w-7 h-7 rounded-full bg-indigo-500/20 group-hover:bg-indigo-500/30 flex items-center justify-center transition-colors">
                <span className="text-[11px] font-semibold text-indigo-300">
                  {initials(user.name)}
                </span>
              </div>
              <span className="hidden md:block text-xs text-gray-400 group-hover:text-gray-200 font-medium transition-colors">
                {user.name.split(" ")[0]}
              </span>
            </Link>
            <button
              onClick={handleSignOut}
              className="hidden md:block text-[11px] text-gray-600 hover:text-gray-300 font-medium tracking-wide transition-colors"
            >
              Выйти
            </button>
          </>
        )}

        {/* Burger — mobile + tablet */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="md:hidden flex items-center justify-center w-8 h-8 rounded-md text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors"
          aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={menuOpen}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            {menuOpen ? (
              <path d="M4 4l10 10M14 4L4 14" />
            ) : (
              <path d="M2 5h14M2 9h14M2 13h14" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden absolute top-14 left-0 right-0 bg-[#111116] border-b border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.5)] px-3 py-3">
          <div className="flex flex-col gap-0.5">
            {visibleLinks.map(({ href, label }) => {
              const active = path.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={`px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? "text-indigo-300 bg-indigo-500/15"
                      : "text-gray-300 hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {user && (
            <>
              <div className="my-3 h-px bg-white/10" />
              <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-white/[0.06] transition-colors">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-indigo-300">
                    {initials(user.name)}
                  </span>
                </div>
                <span className="text-sm text-gray-300 font-medium">{user.name}</span>
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full text-left px-3 py-2.5 mt-0.5 text-sm text-gray-400 hover:text-white hover:bg-white/[0.06] rounded-md font-medium transition-colors"
              >
                Выйти
              </button>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
