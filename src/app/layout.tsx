import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ensureBotRunning } from "@/lib/bot-runner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Запускаем Telegram-бота внутри процесса Next.js (singleton — запустится один раз)
// Бот живёт пока жив dev-сервер, который поддерживается системой
void ensureBotRunning();

export const metadata: Metadata = {
  title: "Кальянный ассистент — AI-учёт табака",
  description: "Умный ассистент старшего кальянного мастера: распознавание накладных, голосовое обновление остатков, заявки на закуп.",
  keywords: ["кальян", "табак", "учёт", "ассистент", "AI"],
  authors: [{ name: "Hookah Assistant" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
