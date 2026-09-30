"use client";

import { Copy, FileText, MessageCircle, Minus, Plus, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useCart } from "@/hooks/useCart";
import { formatTablewarePrice, telegramShareUrl, whatsappShareUrl } from "@/lib/tableware-message";

export function CartPanel({ compact = false }: { compact?: boolean }) {
  const cart = useCart();
  const [copied, setCopied] = useState(false);
  const lines = cart.lines;
  const grouped = useMemo(() => {
    return lines.reduce<Record<string, typeof lines>>((acc, line) => {
      acc[line.product.productType] = acc[line.product.productType] ?? [];
      acc[line.product.productType].push(line);
      return acc;
    }, {});
  }, [lines]);

  const copyMessage = async () => {
    await navigator.clipboard.writeText(cart.message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <aside className="rounded-2xl border border-[#ded4c3] bg-[#17382d] p-4 text-white shadow-[0_22px_70px_rgba(15,61,46,0.22)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#d7bf7a]">Tanlangan set</p>
          <h2 className="mt-1 text-xl font-black">Buyurtma ro'yxati</h2>
        </div>
        <div className="rounded-2xl bg-white/10 px-3 py-2 text-right">
          <p className="text-xs text-white/65">Jami</p>
          <p className="font-black">{cart.totalQuantity} dona</p>
        </div>
      </div>

      {cart.lines.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/20 bg-white/5 p-5 text-sm text-white/70">
          Hali mahsulot tanlanmagan. Filterdan mos idishlarni topib, setga qo'shing.
        </div>
      ) : (
        <div className={`${compact ? "max-h-72" : "max-h-[50vh]"} mt-5 space-y-4 overflow-auto pr-1`}>
          {Object.entries(grouped).map(([category, lines]) => (
            <section key={category}>
              <h3 className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-[#d7bf7a]">{category}</h3>
              <div className="space-y-2">
                {lines.map((line) => (
                  <div key={line.productId} className="rounded-2xl bg-white/9 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold">{line.product.name}</p>
                        <p className="text-xs text-white/60">
                          {line.product.code} · {line.product.size}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="O'chirish"
                        onClick={() => cart.removeProduct(line.productId)}
                        className="grid h-8 w-8 place-items-center rounded-full text-white/65 hover:bg-white/10 hover:text-white"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center overflow-hidden rounded-full bg-white/10">
                        <button
                          type="button"
                          aria-label="Kamaytirish"
                          onClick={() => cart.updateQuantity(line.productId, line.quantity - 1)}
                          className="grid h-8 w-8 place-items-center hover:bg-white/10"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-10 text-center text-sm font-black">{line.quantity}</span>
                        <button
                          type="button"
                          aria-label="Ko'paytirish"
                          onClick={() => cart.updateQuantity(line.productId, line.quantity + 1)}
                          className="grid h-8 w-8 place-items-center hover:bg-white/10"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="text-sm font-black">{formatTablewarePrice(line.subtotal)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="mt-5 rounded-2xl bg-white p-4 text-[#17382d]">
        <div className="flex items-center justify-between text-sm">
          <span>Taxminiy summa</span>
          <strong className="text-lg">{formatTablewarePrice(cart.totalPrice)}</strong>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <a
          href={telegramShareUrl(cart.message)}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#d7bf7a] px-4 text-sm font-black text-[#17382d] transition hover:bg-[#e7cf8a] ${
            cart.lines.length === 0 ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <Send className="h-4 w-4" />
          Telegramga yuborish
        </a>
        <a
          href={whatsappShareUrl(cart.message)}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white/12 px-4 text-sm font-bold text-white transition hover:bg-white/18 ${
            cart.lines.length === 0 ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <MessageCircle className="h-4 w-4" />
          WhatsAppga yuborish
        </a>
        <button
          type="button"
          disabled={cart.lines.length === 0}
          onClick={copyMessage}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white/12 px-4 text-sm font-bold text-white transition hover:bg-white/18 disabled:opacity-50"
        >
          <Copy className="h-4 w-4" />
          {copied ? "Nusxalandi" : "Ro'yxatni nusxalash"}
        </button>
        <button
          type="button"
          disabled
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white/8 px-4 text-sm font-bold text-white/55"
        >
          <FileText className="h-4 w-4" />
          PDF yuklab olish
        </button>
      </div>
    </aside>
  );
}
