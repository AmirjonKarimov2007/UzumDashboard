import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = "UZS") {
  return new Intl.NumberFormat("uz-UZ", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("uz-UZ").format(value);
}

// ─── Sana formati ─────────────────────────────────────────────────────────
// Oddiy, kundalik ko'rinish: "05.06.2026" va "05.06.2026 14:30".
// `uz-UZ` lokali brauzer/ICU'ga qarab g'alati so'zli oylar ("5-iyn") chiqarib
// yuborgani uchun qo'lda, lokaldan mustaqil formatlaymiz — hamma joyda bir xil.
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Berilgan qiymatni Date'ga aylantiradi (ms raqam, ISO string yoki Date). */
function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** "05.06.2026" */
export function formatDate(date: Date | string | number | null | undefined) {
  const d = toDate(date);
  if (!d) return "—";
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** "05.06.2026 14:30" */
export function formatDateTime(date: Date | string | number | null | undefined) {
  const d = toDate(date);
  if (!d) return "—";
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "14:30" — faqat vaqt. */
export function formatTime(date: Date | string | number | null | undefined) {
  const d = toDate(date);
  if (!d) return "—";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatPercentage(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function truncate(str: string, length: number) {
  if (str.length <= length) return str;
  return `${str.slice(0, length)}...`;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}