import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Audio Annotation Assessment",
  description: "Timed candidate audio annotation assessment",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
