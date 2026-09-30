"use client";

import { useState } from "react";
import { Minus, Plus, ShoppingBasket } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import type { Product, ReadySetItem } from "@/lib/tableware-types";

export function ProductAddToSet({ product }: { product: Product }) {
  const cart = useCart();
  const [quantity, setQuantity] = useState(product.packageQuantity);

  return (
    <div className="rounded-3xl border border-[#e7decf] bg-white p-5 shadow-[0_18px_55px_rgba(45,35,20,0.07)]">
      <p className="text-sm font-bold text-[#51483b]">Setga qo'shiladigan miqdor</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center overflow-hidden rounded-full border border-[#d9cebb] bg-[#fffaf0]">
          <button
            type="button"
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            className="grid h-11 w-11 place-items-center text-[#17382d] hover:bg-[#f2eadc]"
            aria-label="Kamaytirish"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-14 text-center font-black text-[#1f1b16]">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((value) => value + 1)}
            className="grid h-11 w-11 place-items-center text-[#17382d] hover:bg-[#f2eadc]"
            aria-label="Ko'paytirish"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => cart.addProduct(product, quantity)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0f3d2e] px-5 text-sm font-black text-white transition hover:bg-[#08291f]"
        >
          <ShoppingBasket className="h-4 w-4" />
          Setga qo'shish
        </button>
      </div>
    </div>
  );
}

export function ItemsAddToSet({ items, label = "Setni builderga qo'shish" }: { items: ReadySetItem[]; label?: string }) {
  const cart = useCart();
  return (
    <button
      type="button"
      onClick={() => cart.addItems(items)}
      className="inline-flex h-11 items-center justify-center rounded-full bg-[#0f3d2e] px-5 text-sm font-black text-white transition hover:bg-[#08291f]"
    >
      {label}
    </button>
  );
}
