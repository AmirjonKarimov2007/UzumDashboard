import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { TelegramInit } from "@/components/telegram-init";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Uzum Dashboard",
  description: "Analytics and finance dashboard for Uzum Market",
};

// Telefon va Telegram WebApp uchun: zoom o'chirilgan (input fokusda sakrash
// bo'lmaydi, tugmalar bir bosishda ishlaydi), viewport-fit=cover safe-area uchun.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
  ],
};

// Inline script that runs before React hydrates — sets data-theme on <html>
// from localStorage so the user doesn't see a flash of the wrong theme.
const themeBootstrapScript = `
(function() {
  try {
    var raw = localStorage.getItem('dashboard-prefs');
    var theme = 'dark';
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.state && (parsed.state.theme === 'light' || parsed.state.theme === 'dark')) {
        theme = parsed.state.theme;
      }
    }
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uz"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <TelegramInit />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
