"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";

export default function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (loading) return;
    const publicPaths = ["/login", "/register"];
    if (!user && !publicPaths.includes(path)) router.replace("/login");
  }, [user, loading, path, router]);

  const publicPaths = ["/login", "/register"];

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
        <div className="relative flex items-center justify-center">
          <svg className="animate-spin absolute" width="64" height="64" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="28" stroke="#e0e7ff" strokeWidth="4"/>
            <path d="M32 4a28 28 0 0 1 28 28" stroke="#6366f1" strokeWidth="4" strokeLinecap="round"/>
          </svg>
          <svg className="animate-spin absolute" style={{ animationDirection: "reverse", animationDuration: "1.4s" }} width="44" height="44" viewBox="0 0 44 44" fill="none">
            <circle cx="22" cy="22" r="18" stroke="#e0e7ff" strokeWidth="3"/>
            <path d="M22 4a18 18 0 0 1 12.7 5.3" stroke="#a5b4fc" strokeWidth="3" strokeLinecap="round"/>
          </svg>
          <span className="text-2xl select-none">🤖</span>
        </div>
        <p className="text-sm font-medium text-indigo-500">Загрузка…</p>
      </div>
    );
  }
  if (!user && !publicPaths.includes(path)) return null;

  const isPublic = publicPaths.includes(path);
  if (isPublic) return <>{children}</>;

  return (
    <>
      <Navbar />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">{children}</main>
    </>
  );
}
