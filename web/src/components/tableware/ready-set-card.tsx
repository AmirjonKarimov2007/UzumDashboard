"use client";

import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";
import { products } from "@/data/products";
import { useCart } from "@/hooks/useCart";
import { formatTablewarePrice } from "@/lib/tableware-message";
import type { ReadySet } from "@/lib/tableware-types";

export function ReadySetCard({ readySet }: { readySet: ReadySet }) {
  const cart = useCart();
  const lines = readySet.items
    .map((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      return product ? { product, quantity: item.quantity } : null;
    })
    .filter((line): line is { product: (typeof products)[number]; quantity: number } => Boolean(line));
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalPrice = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const categories = [...new Set(lines.map((line) => line.product.productType))].slice(0, 5);

  return (
    <article className="rounded-3xl border border-[#e7decf] bg-white p-5 shadow-[0_18px_55px_rgba(45,35,20,0.07)]">
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fff3df] text-[#9a6b25]">
          <Layers className="h-6 w-6" />
        </span>
        <span className="rounded-full bg-[#f0f6ec] px-3 py-1 text-xs font-bold text-[#28724d]">
          {readySet.budgetSegment}
        </span>
      </div>
      <h2 className="mt-5 text-2xl font-black text-[#1f1b16]">{readySet.name}</h2>
      <p className="mt-2 min-h-12 text-sm text-[#766b5b]">{readySet.description}</p>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-[#fffaf0] p-3">
          <p className="text-xs text-[#8b8070]">Mos joy</p>
          <p className="font-black text-[#1f1b16]">{readySet.restaurantType}</p>
        </div>
        <div className="rounded-2xl bg-[#fffaf0] p-3">
          <p className="text-xs text-[#8b8070]">Tavsiya</p>
          <p className="font-black text-[#1f1b16]">{readySet.recommendedSeats} o'rin</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {categories.map((category) => (
          <span key={category} className="rounded-full border border-[#e2d8c9] px-3 py-1 text-xs font-bold text-[#5f5548]">
            {category}
          </span>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-[#eee5d7] pt-4">
        <div>
          <p className="text-xs text-[#8b8070]">{totalQuantity} dona</p>
          <p className="text-lg font-black text-[#17382d]">{formatTablewarePrice(totalPrice)}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/sets/${readySet.slug}`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#d9cebb] px-4 text-sm font-bold text-[#17382d] hover:bg-[#fffaf0]"
          >
            Setni ko'rish
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => cart.addItems(readySet.items)}
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#0f3d2e] px-4 text-sm font-bold text-white hover:bg-[#08291f]"
          >
            Builderga qo'shish
          </button>
        </div>
      </div>
    </article>
  );
}
