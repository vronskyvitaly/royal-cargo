"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/transcripts", label: "Звонки" },
  { href: "/articles", label: "Статьи" },
];

export default function Navbar() {
  const path = usePathname();
  return (
    <nav className="border-b bg-white px-6 py-3 flex items-center gap-6 shadow-sm">
      <span className="font-bold text-lg text-blue-700 mr-4">Royal Cargo</span>
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`text-sm font-medium transition-colors ${
            path.startsWith(href)
              ? "text-blue-600 border-b-2 border-blue-600 pb-0.5"
              : "text-gray-600 hover:text-blue-600"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
