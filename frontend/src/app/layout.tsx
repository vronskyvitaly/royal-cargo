import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Guard from "@/components/Guard";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Royal Cargo — Редакция статей",
  description: "Генерация и публикация SEO-статей на основе звонков",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${geist.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <AuthProvider>
          <Guard>{children}</Guard>
        </AuthProvider>
      </body>
    </html>
  );
}
