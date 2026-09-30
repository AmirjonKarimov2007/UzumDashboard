"use client";

import { useEffect } from "react";

// Telegram WebApp ichida ochilganda appni to'liq ekranga kengaytiradi,
// vertikal swipe bilan yopilib qolishni o'chiradi va header/fon ranglarini
// joriy temaga moslaydi. Oddiy brauzerda hech narsa qilmaydi.
export function TelegramInit() {
  useEffect(() => {
    let themeObserver: MutationObserver | undefined;
    const cleanups: Array<() => void> = [];
    const dispose = () => {
      themeObserver?.disconnect();
      cleanups.splice(0).forEach((cleanup) => cleanup());
      document.documentElement.classList.remove("tg-webapp");
      document.documentElement.style.removeProperty("--app-height");
    };

    const init = () => {
      const tg = (window as any).Telegram?.WebApp;
      // Telegram tashqarisida WebApp obyekti bo'lsa ham platform "unknown" bo'ladi
      if (!tg || (!tg.initData && tg.platform === "unknown")) return;

      try {
        tg.ready();
        tg.expand();
        tg.requestFullscreen?.();
        // Ro'yxatlarni scroll qilganda app pastga tortilib yopilmasin
        tg.disableVerticalSwipes?.();
        tg.isClosingConfirmationEnabled = false;

        const applyTheme = () => {
          const light = document.documentElement.getAttribute("data-theme") === "light";
          const bg = light ? "#f4f6fb" : "#090d18";
          tg.setHeaderColor?.(bg);
          tg.setBackgroundColor?.(bg);
          tg.setBottomBarColor?.(bg);
        };
        applyTheme();

        // Tema almashtirilganda Telegram ranglarini ham yangilaymiz
        themeObserver = new MutationObserver(applyTheme);
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-theme"],
        });

        // Klaviatura ochilganda/yopilganda layout sakramasligi uchun barqaror balandlik
        const setViewport = () => {
          const visualHeight = window.visualViewport?.height;
          const telegramHeight = tg.viewportStableHeight || tg.viewportHeight;
          const height = visualHeight || telegramHeight || window.innerHeight;
          document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
          document.documentElement.style.setProperty("--tg-vh", `${Math.round(height)}px`);

          const safe = tg.contentSafeAreaInset || tg.safeAreaInset;
          if (safe) {
            document.documentElement.style.setProperty("--tg-safe-top", `${safe.top || 0}px`);
            document.documentElement.style.setProperty("--tg-safe-right", `${safe.right || 0}px`);
            document.documentElement.style.setProperty("--tg-safe-bottom", `${safe.bottom || 0}px`);
            document.documentElement.style.setProperty("--tg-safe-left", `${safe.left || 0}px`);
          }
        };
        setViewport();
        tg.onEvent?.("viewportChanged", setViewport);
        tg.onEvent?.("safeAreaChanged", setViewport);
        tg.onEvent?.("contentSafeAreaChanged", setViewport);
        tg.onEvent?.("themeChanged", applyTheme);
        window.visualViewport?.addEventListener("resize", setViewport);
        window.addEventListener("orientationchange", setViewport);
        cleanups.push(() => {
          tg.offEvent?.("viewportChanged", setViewport);
          tg.offEvent?.("safeAreaChanged", setViewport);
          tg.offEvent?.("contentSafeAreaChanged", setViewport);
          tg.offEvent?.("themeChanged", applyTheme);
          window.visualViewport?.removeEventListener("resize", setViewport);
          window.removeEventListener("orientationchange", setViewport);
        });

        document.documentElement.classList.add("tg-webapp");
      } catch {
        // Telegram API versiyasi eski bo'lsa ham app ishlashda davom etadi
      }
    };

    const existing = document.getElementById("tg-webapp-sdk") as HTMLScriptElement | null;
    if (existing) {
      if ((window as any).Telegram?.WebApp) init();
      else existing.addEventListener("load", init, { once: true });
      return () => {
        existing.removeEventListener("load", init);
        dispose();
      };
    }
    const s = document.createElement("script");
    s.id = "tg-webapp-sdk";
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.async = true;
    s.addEventListener("load", init, { once: true });
    document.head.appendChild(s);

    return () => {
      s.removeEventListener("load", init);
      dispose();
    };
  }, []);

  return null;
}
