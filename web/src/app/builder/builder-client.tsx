"use client";

import { useState } from "react";
import { ShoppingBasket } from "lucide-react";
import { CartPanel } from "@/components/tableware/cart-panel";
import { FilterPanel } from "@/components/tableware/filter-panel";
import { ProductCard } from "@/components/tableware/product-card";
import { RecommendationBuilder } from "@/components/tableware/recommendation-builder";
import { SiteHeader } from "@/components/tableware/site-header";
import { useCart } from "@/hooks/useCart";
import { useProductFilters } from "@/hooks/useProductFilters";

export function BuilderClient() {
  const filter = useProductFilters();
  const cart = useCart();
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  return (
    <main className="tableware-shell min-h-screen bg-[#fffdf8] text-[#1f1b16]">
      <SiteHeader />
      <section className="border-b border-[#eadfce] bg-[#f7f0e6]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b1863d]">Katalog + set builder</p>
          <h1 className="mt-2 text-4xl font-black text-[#17382d]">Idish setini yig'ing</h1>
          <p className="mt-3 max-w-2xl text-[#6b6254]">
            Joy turi, taom, material, o'lcham va byudjet bo'yicha mahsulotlarni tanlab, menejerga tayyor ro'yxat yuboring.
          </p>
        </div>
      </section>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_1fr_340px] lg:px-8">
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <FilterPanel
              filters={filter.filters}
              onSearch={filter.setSearch}
              onToggle={filter.toggleFilter}
              onClear={filter.clearFilters}
              activeFilterCount={filter.activeFilterCount}
            />
          </div>
        </div>
        <div className="space-y-6">
          <details className="rounded-2xl border border-[#e7decf] bg-white p-4 lg:hidden">
            <summary className="cursor-pointer text-sm font-black text-[#17382d]">
              Filterlarni ochish ({filter.activeFilterCount})
            </summary>
            <div className="mt-4">
              <FilterPanel
                filters={filter.filters}
                onSearch={filter.setSearch}
                onToggle={filter.toggleFilter}
                onClear={filter.clearFilters}
                activeFilterCount={filter.activeFilterCount}
              />
            </div>
          </details>

          <RecommendationBuilder />

          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-[#17382d]">Mahsulotlar</h2>
              <p className="text-sm text-[#766b5b]">{filter.products.length} ta mos mahsulot topildi</p>
            </div>
          </div>

          {filter.products.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#d9cebb] bg-white p-10 text-center">
              <h3 className="text-xl font-black text-[#1f1b16]">Mos mahsulot topilmadi</h3>
              <p className="mt-2 text-[#766b5b]">Filterlarni kamaytiring yoki boshqa qidiruv so'zini kiriting.</p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filter.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <CartPanel />
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#ded4c3] bg-white/95 p-3 backdrop-blur lg:hidden">
        {mobileCartOpen && (
          <div className="mb-3 max-h-[70vh] overflow-auto">
            <CartPanel compact />
          </div>
        )}
        <button
          type="button"
          onClick={() => setMobileCartOpen((open) => !open)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0f3d2e] text-sm font-black text-white"
        >
          <ShoppingBasket className="h-4 w-4" />
          Setni ko'rish · {cart.totalQuantity} dona
        </button>
      </div>
    </main>
  );
}
