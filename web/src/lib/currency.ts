import type { Currency } from "@/stores/dashboard-store";

/**
 * Format an amount (stored in UZS) for display in the chosen currency.
 *   • UZS → "12 345 678 so'm"
 *   • USD → "$1 234.56"  (amountUzs / rate)
 * `rate` = how many UZS for 1 USD.
 */
export function formatMoney(amountUzs: number, currency: Currency, rate: number): string {
  const n = Number(amountUzs) || 0;
  // USD ko'rsatish faqat to'g'ri kurs bo'lganda. Aks holda (kurs 0/kiritilmagan)
  // so'mda ko'rsatamiz — aks holda barcha summalar yolg'ondan "$0.00" bo'lib qoladi.
  if (currency === "USD" && rate > 0) {
    const usd = n / rate;
    return (
      "$" +
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(usd)
    );
  }
  return new Intl.NumberFormat("uz-UZ").format(Math.round(n)) + " so'm";
}

/** Convert a USD amount to UZS using the rate. */
export function usdToUzs(usd: number, rate: number): number {
  return (Number(usd) || 0) * (rate > 0 ? rate : 0);
}

/** Convert a UZS amount to USD using the rate. */
export function uzsToUsd(uzs: number, rate: number): number {
  return rate > 0 ? (Number(uzs) || 0) / rate : 0;
}

/** Short currency unit label for hints. */
export function currencyUnit(currency: Currency): string {
  return currency === "USD" ? "$" : "so'm";
}
