// FBS ta'minlash uchun "Yuborish dalolatnomasi" (qabul-topshirish akti).
// Uzum seller-openapi'da rasmiy akt/PDF endpointi YO'Q (tekshirildi: /act,
// /pdf, /document(s) — 404), shuning uchun aktni o'zimiz A4 HTML qilib
// shakllantirib chop etamiz — yig'ish varaqasi bilan bir xil pipeline.

import { printHtmlDocument } from "./qr-print";
import { apiClient } from "./api/client";

/**
 * Ta'minlash aktini (yuborish dalolatnomasi) Uzum'ning RASMIY PDF'i sifatida
 * to'g'ridan-to'g'ri chop etadi — ALOHIDA sahifa/tab OCHILMAYDI. PDF yashirin
 * iframe'ga yuklanib, shu sahifaning o'zida chop oynasi chiqadi. Backend
 * `/fbs/invoices/{id}/act` Uzum'dan tayyor PDF'ni stream qiladi.
 * `kind: "closing"` qabul aktini oladi. Muvaffaqiyatsiz bo'lsa `false`
 * qaytaradi (chaqiruvchi HTML fallback'ga o'tadi).
 */
export async function printInvoiceActPdf(
  storeId: string,
  invoiceId: number | string,
  kind: "act" | "closing" = "act",
): Promise<boolean> {
  const path = kind === "closing" ? "closing-documents" : "act";
  try {
    const res = await apiClient.get(
      `/marketplace/stores/${storeId}/fbs/invoices/${invoiceId}/${path}`,
      { responseType: "blob" },
    );
    const blob = new Blob([res.data as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    // Telegram WebApp ichida iframe.print() ishonchsiz — PDF'ni yuklab beramiz,
    // foydalanuvchi o'z qurilmasidagi ko'ruvchida ochib chop etadi/saqlaydi.
    const tg = (window as any).Telegram?.WebApp;
    const inTelegram =
      document.documentElement.classList.contains("tg-webapp") ||
      (tg && tg.initData && tg.platform && tg.platform !== "unknown");
    if (inTelegram) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `dalolatnoma_${invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return true;
    }

    // Yashirin iframe — sahifani tark etmasdan chop oynasini chiqaradi
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      URL.revokeObjectURL(url);
      iframe.remove();
    };

    iframe.onload = () => {
      // PDF render bo'lib ulgurishi uchun kichik kechikish
      setTimeout(() => {
        try {
          const win = iframe.contentWindow;
          if (!win) { cleanup(); return; }
          win.focus();
          // Chop oynasi yopilgach tozalaymiz
          win.onafterprint = cleanup;
          win.print();
        } catch {
          cleanup();
        }
      }, 250);
      // Zaxira tozalash (afterprint ishlamasa ham resurs qolib ketmaydi)
      setTimeout(cleanup, 120_000);
    };

    iframe.src = url;
    document.body.appendChild(iframe);
    return true;
  } catch {
    return false;
  }
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
}

function fmtSum(n: number): string {
  return `${new Intl.NumberFormat("uz-UZ").format(Math.round(n))} so'm`;
}

function fmtDate(ms?: number | string | null): string {
  if (!ms) return "—";
  const d = new Date(typeof ms === "string" ? ms : Number(ms));
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("uz-UZ", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtSlot(from?: number | null, to?: number | null): string {
  if (!from && !to) return "—";
  return `${fmtDate(from)} — ${fmtDate(to)}`;
}

export interface InvoiceActOptions {
  /** Sotuvchi (do'kon) nomi — imzo qatorida ko'rsatiladi. */
  sellerName?: string;
}

/**
 * Ta'minlash (invoice) va uning buyurtmalari asosida yuborish dalolatnomasini
 * chop etadi. `orders` — `/fbs/invoices/{id}/orders` javobidagi ro'yxat.
 */
export async function printInvoiceAct(
  invoice: any,
  orders: any[],
  opts: InvoiceActOptions = {},
): Promise<void> {
  const number = invoice?.number ?? invoice?.id ?? "—";
  const place =
    invoice?.dropOffPoint?.address ||
    [invoice?.stock?.title, invoice?.stock?.address].filter(Boolean).join(", ") ||
    "—";

  let totalQty = 0;
  let totalSum = 0;

  const rows = (orders || []).map((o: any, i: number) => {
    const items = o?.items || o?.orderItems || [];
    const qty = items.reduce((s: number, it: any) => s + (Number(it?.amount) || 1), 0);
    const sum = Number(o?.fullPrice) ||
      items.reduce((s: number, it: any) => s + (Number(it?.price) || 0) * (Number(it?.amount) || 1), 0);
    totalQty += qty;
    totalSum += sum;

    const itemsHtml = items
      .map((it: any) => {
        const name = esc(it?.title || it?.skuTitle || "—");
        const sku = it?.skuTitle && it?.title ? ` <span class="sku">(${esc(it.skuTitle)})</span>` : "";
        return `${name}${sku} × ${Number(it?.amount) || 1}`;
      })
      .join("<br>");

    return `<tr>
      <td class="c">${i + 1}</td>
      <td class="mono">${esc(o?.orderId ?? o?.id ?? "—")}</td>
      <td>${itemsHtml || "—"}</td>
      <td class="c">${qty}</td>
      <td class="r mono">${fmtSum(sum)}</td>
    </tr>`;
  });

  const now = new Date().toLocaleString("uz-UZ", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Dalolatnoma №${esc(number)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #111; margin: 0; font-size: 11pt; }
    h1 { font-size: 15pt; text-align: center; margin: 0 0 2mm; text-transform: uppercase; letter-spacing: .5px; }
    .sub { text-align: center; font-size: 10pt; color: #444; margin: 0 0 7mm; }
    .info { width: 100%; border-collapse: collapse; margin-bottom: 6mm; font-size: 10pt; }
    .info td { padding: 1.4mm 2mm; vertical-align: top; }
    .info .k { color: #555; white-space: nowrap; width: 1%; padding-right: 4mm; }
    .info .v { font-weight: 600; }
    table.list { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    table.list th, table.list td { border: 1px solid #999; padding: 2mm 2.5mm; text-align: left; vertical-align: top; }
    table.list th { background: #f0f0f0; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .4px; }
    .c { text-align: center; } .r { text-align: right; }
    .mono { font-family: Consolas, monospace; }
    .sku { color: #555; font-size: 8.5pt; }
    tfoot td { font-weight: 700; background: #f0f0f0; }
    .signs { display: flex; gap: 12mm; margin-top: 12mm; font-size: 10pt; }
    .signs > div { flex: 1; }
    .signs .role { font-weight: 700; margin-bottom: 10mm; }
    .signs .line { border-bottom: 1px solid #111; height: 6mm; margin-bottom: 1.5mm; }
    .signs .hint { font-size: 8.5pt; color: #555; }
    .foot { margin-top: 10mm; font-size: 8.5pt; color: #777; text-align: center; }
  </style></head><body>
    <h1>Qabul-topshirish dalolatnomasi</h1>
    <p class="sub">FBS ta'minlash №${esc(number)} bo'yicha yuborish dalolatnomasi</p>

    <table class="info">
      <tr>
        <td class="k">Ta'minlash raqami:</td><td class="v mono">№${esc(number)}</td>
        <td class="k">Yaratilgan sana:</td><td class="v">${fmtDate(invoice?.dateCreated)}</td>
      </tr>
      <tr>
        <td class="k">Topshirish punkti:</td><td class="v">${esc(place)}</td>
        <td class="k">Vaqt oralig'i:</td><td class="v">${fmtSlot(invoice?.timeSlot?.timeFrom, invoice?.timeSlot?.timeTo)}</td>
      </tr>
      <tr>
        ${opts.sellerName ? `<td class="k">Sotuvchi:</td><td class="v">${esc(opts.sellerName)}</td>` : `<td class="k"></td><td></td>`}
        ${invoice?.ettn ? `<td class="k">ETTN:</td><td class="v mono">${esc(invoice.ettn)}</td>` : `<td class="k"></td><td></td>`}
      </tr>
    </table>

    <table class="list">
      <thead><tr>
        <th class="c" style="width:8mm">№</th>
        <th style="width:26mm">Buyurtma ID</th>
        <th>Mahsulotlar</th>
        <th class="c" style="width:14mm">Dona</th>
        <th class="r" style="width:30mm">Summa</th>
      </tr></thead>
      <tbody>${rows.join("")}</tbody>
      <tfoot><tr>
        <td colspan="3" class="r">JAMI: ${rows.length} ta buyurtma</td>
        <td class="c">${totalQty}</td>
        <td class="r mono">${fmtSum(totalSum)}</td>
      </tr></tfoot>
    </table>

    <div class="signs">
      <div>
        <p class="role">Topshirdi — Sotuvchi${opts.sellerName ? ` (${esc(opts.sellerName)})` : ""}:</p>
        <div class="line"></div>
        <p class="hint">F.I.Sh., imzo</p>
        <div class="line" style="margin-top:8mm"></div>
        <p class="hint">Sana</p>
      </div>
      <div>
        <p class="role">Qabul qildi — Uzum Market:</p>
        <div class="line"></div>
        <p class="hint">F.I.Sh., imzo</p>
        <div class="line" style="margin-top:8mm"></div>
        <p class="hint">Sana</p>
      </div>
    </div>

    <p class="foot">Ushbu dalolatnoma ${esc(now)} da Uzum Seller Hub orqali shakllantirildi.</p>
  </body></html>`;

  await printHtmlDocument(html);
}
