import type { Metadata } from "next";
import { Archivo, Fragment_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ensureBotRunning } from "@/lib/bot-runner";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const fragmentMono = Fragment_Mono({
  variable: "--font-fragment-mono",
  subsets: ["latin"],
  weight: ["400"],
});

// Запускаем Telegram-бота внутри процесса Next.js (singleton — запустится один раз)
void ensureBotRunning();

export const metadata: Metadata = {
  title: "Hookah Assistant — кальянная CRM",
  description: "Учёт табака, смены мастеров, заявки и хотелки. Веб-панель + Telegram-бот.",
  keywords: ["кальян", "табак", "учёт", "ассистент", "CRM"],
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
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${archivo.variable} ${fragmentMono.variable} antialiased bg-background text-foreground font-sans`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
