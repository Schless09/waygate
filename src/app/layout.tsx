import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "Audio Annotation Assessment",
  description: "Timed candidate audio annotation assessment",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full">
        <header className="mx-auto flex w-full max-w-6xl items-center gap-2.5 px-6 pt-6">
          <span className="size-7 rounded-lg bg-[conic-gradient(from_200deg,var(--color-brand-300),var(--color-brand-700),var(--color-brand-400))] shadow-sm shadow-brand-600/30" />
          <span className="text-lg font-semibold tracking-tight">Recruitcha Labs</span>
          <span className="text-lg font-light text-slate-500">Assessments</span>
        </header>
        {children}
      </body>
    </html>
  );
}
