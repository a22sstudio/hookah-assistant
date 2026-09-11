import type { Metadata } from "next";
import { Inter, Fragment_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ensureBotRunning } from "@/lib/bot-runner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const fragmentMono = Fragment_Mono({
  variable: "--font-fragment-mono",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

// Запускаем Telegram-бота внутри процесса Next.js (singleton)
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

// Inline script для предотвращения FOUC (flash of unstyled content) при theme switch
const themeScript = `
  (function() {
    try {
      const stored = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const theme = stored || (prefersDark ? 'dark' : 'light');
      if (theme === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${inter.variable} ${fragmentMono.variable} antialiased bg-background text-foreground theme-transition`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
