import type { Metadata, Viewport } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { TelegramInit } from "@/components/telegram-init";
import { CartProvider } from "@/hooks/useCart";
import "./globals.css";

const manrope = Manrope({
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
  title: {
    default: "Uzum Seller Hub",
    template: "%s | Uzum Seller Hub",
  },
  description: "Uzum Marketplace savdo, moliya, ombor va tahlil boshqaruv markazi.",
  applicationName: "Uzum Seller Hub",
};

// Telegram WebApp va zamonaviy telefonlarda notch/safe-area bilan to'liq ekran.
// Zoom ochiq qoladi: bu jadval va hisobotlarni o'qishda accessibility uchun muhim.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090d18" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6fb" },
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
      className={`${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <TelegramInit />
        <Providers>
          <CartProvider>{children}</CartProvider>
        </Providers>
      </body>
    </html>
  );
}
