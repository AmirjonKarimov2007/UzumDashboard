"use client";

import { useEffect } from "react";

// Telegram WebApp ichida ochilganda appni to'liq ekranga kengaytiradi,
// vertikal swipe bilan yopilib qolishni o'chiradi va header/fon ranglarini
// joriy temaga moslaydi. Oddiy brauzerda hech narsa qilmaydi.
export function TelegramInit() {
  useEffect(() => {
    const init = () => {
      const tg = (window as any).Telegram?.WebApp;
      // Telegram tashqarisida WebApp obyekti bo'lsa ham platform "unknown" bo'ladi
      if (!tg || (!tg.initData && tg.platform === "unknown")) return;

      try {
        tg.ready();
        tg.expand();
        // Ro'yxatlarni scroll qilganda app pastga tortilib yopilmasin
        tg.disableVerticalSwipes?.();
        tg.isClosingConfirmationEnabled = false;

        const applyTheme = () => {
          const light = document.documentElement.getAttribute("data-theme") === "light";
          const bg = light ? "#f5f6f8" : "#09090b";
          tg.setHeaderColor?.(bg);
          tg.setBackgroundColor?.(bg);
          tg.setBottomBarColor?.(bg);
        };
        applyTheme();

        // Tema almashtirilganda Telegram ranglarini ham yangilaymiz
        const themeObserver = new MutationObserver(applyTheme);
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-theme"],
        });

        // Klaviatura ochilganda/yopilganda layout sakramasligi uchun barqaror balandlik
        const setVh = () => {
          const h = tg.viewportStableHeight || tg.viewportHeight;
          if (h) document.documentElement.style.setProperty("--tg-vh", `${h}px`);
        };
        setVh();
        tg.onEvent?.("viewportChanged", setVh);

        document.documentElement.classList.add("tg-webapp");
      } catch {
        // Telegram API versiyasi eski bo'lsa ham app ishlashda davom etadi
      }
    };

    const existing = document.getElementById("tg-webapp-sdk") as HTMLScriptElement | null;
    if (existing) {
      if ((window as any).Telegram?.WebApp) init();
      else existing.addEventListener("load", init, { once: true });
      return;
    }
    const s = document.createElement("script");
    s.id = "tg-webapp-sdk";
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, []);

  return null;
}
