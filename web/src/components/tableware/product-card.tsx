"use client";

import Link from "next/link";
import { Minus, Plus, ShoppingBasket } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { formatTablewarePrice } from "@/lib/tableware-message";
import type { Product } from "@/lib/tableware-types";
import { ProductVisual } from "./product-visual";

export function ProductCard({ product }: { product: Product }) {
  const cart = useCart();
  const line = cart.lines.find((item) => item.productId === product.id);

  return (
    <article className="group overflow-hidden rounded-2xl border border-[#e7decf] bg-white shadow-[0_16px_50px_rgba(45,35,20,0.08)] transition hover:-translate-y-1 hover:shadow-[0_20px_70px_rgba(45,35,20,0.12)]">
      <Link href={`/products/${product.slug}`} className="block p-3 pb-0">
        <ProductVisual imageKey={product.images[0]} name={product.name} />
      </Link>
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b1863d]">{product.code}</p>
            <Link href={`/products/${product.slug}`} className="mt-1 block text-lg font-black text-[#1f1b16]">
              {product.name}
            </Link>
          </div>
          <span className="rounded-full bg-[#f0f6ec] px-3 py-1 text-xs font-bold text-[#28724d]">
            {product.availability}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-[#6b6254]">
          <span>{product.material}</span>
          <span>{product.size}</span>
          <span>{product.productType}</span>
          <span>{product.budgetSegment}</span>
        </div>
        <p className="line-clamp-2 min-h-10 text-sm text-[#766b5b]">{product.foodTypes.join(", ")}</p>
        <div className="flex items-center justify-between gap-3 border-t border-[#eee5d7] pt-4">
          <div>
            <p className="text-xs text-[#8b8070]">Narx</p>
            <p className="text-base font-black text-[#17382d]">{formatTablewarePrice(product.price)}</p>
          </div>
          {line ? (
            <div className="flex items-center overflow-hidden rounded-full border border-[#d9cebb] bg-[#fffaf0]">
              <button
                type="button"
                aria-label="Kamaytirish"
                onClick={() => cart.updateQuantity(product.id, line.quantity - 1)}
                className="grid h-10 w-10 place-items-center text-[#17382d] hover:bg-[#f2eadc]"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-10 text-center text-sm font-black text-[#1f1b16]">{line.quantity}</span>
              <button
                type="button"
                aria-label="Ko'paytirish"
                onClick={() => cart.updateQuantity(product.id, line.quantity + 1)}
                className="grid h-10 w-10 place-items-center text-[#17382d] hover:bg-[#f2eadc]"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => cart.addProduct(product, product.packageQuantity)}
              className="inline-flex items-center gap-2 rounded-full bg-[#0f3d2e] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#08291f]"
            >
              <ShoppingBasket className="h-4 w-4" />
              Setga qo'shish
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
