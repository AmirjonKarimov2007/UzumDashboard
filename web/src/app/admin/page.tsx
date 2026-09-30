"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { SiteHeader } from "@/components/tableware/site-header";
import { products as seedProducts } from "@/data/products";
import { readySets } from "@/data/readySets";
import { productTypes, restaurantTypes } from "@/lib/tableware-config";
import { formatTablewarePrice } from "@/lib/tableware-message";
import type { Product } from "@/lib/tableware-types";

const storageKey = "tableware-admin-products";

function blankProduct(): Product {
  const now = new Date().toISOString();
  return {
    id: `prod-local-${Date.now()}`,
    code: "",
    slug: "",
    name: "",
    description: "",
    price: 0,
    images: ["plate-white"],
    category: "Asosiy idishlar",
    productType: "Tarelka",
    restaurantTypes: ["Restoran"],
    foodTypes: ["Yevropa taomlari uchun"],
    material: "Chinni",
    size: "21-25 sm",
    color: "Oq",
    style: "Oq klassik",
    budgetSegment: "Standart",
    packageQuantity: 12,
    availability: "Mavjud",
    stockQuantity: 0,
    isFeatured: false,
    isVisible: true,
    createdAt: now,
    updatedAt: now,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function AdminPage() {
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [editing, setEditing] = useState<Product | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setProducts(JSON.parse(raw));
    } catch {
      setProducts(seedProducts);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(products));
  }, [products]);

  const visibleCount = useMemo(() => products.filter((product) => product.isVisible).length, [products]);

  const saveProduct = () => {
    if (!editing) return;
    const next = {
      ...editing,
      slug: editing.slug || slugify(editing.name),
      updatedAt: new Date().toISOString(),
    };
    setProducts((current) => {
      const exists = current.some((product) => product.id === next.id);
      return exists ? current.map((product) => (product.id === next.id ? next : product)) : [next, ...current];
    });
    setEditing(null);
  };

  return (
    <main className="tableware-shell min-h-screen bg-[#fffdf8] text-[#1f1b16]">
      <SiteHeader />
      <section className="border-b border-[#eadfce] bg-[#f7f0e6]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b1863d]">Admin panel</p>
          <h1 className="mt-2 text-4xl font-black text-[#17382d]">Mahsulot va setlarni boshqarish</h1>
          <p className="mt-3 max-w-2xl text-[#6b6254]">
            Birinchi MVP uchun ma'lumotlar brauzer xotirasida saqlanadi. Keyin backend yoki baza bilan almashtirish oson.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-[#e7decf] bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b8070]">Mahsulotlar</p>
              <p className="mt-2 text-3xl font-black text-[#17382d]">{products.length}</p>
            </div>
            <div className="rounded-3xl border border-[#e7decf] bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b8070]">Ko'rinadigan</p>
              <p className="mt-2 text-3xl font-black text-[#17382d]">{visibleCount}</p>
            </div>
            <div className="rounded-3xl border border-[#e7decf] bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b8070]">Tayyor setlar</p>
              <p className="mt-2 text-3xl font-black text-[#17382d]">{readySets.length}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-[#e7decf] bg-white shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-[#eee5d7] p-5">
              <div>
                <h2 className="text-2xl font-black text-[#17382d]">Product list</h2>
                <p className="text-sm text-[#766b5b]">Qo'shish, tahrirlash, o'chirish va ko'rinishni almashtirish.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(blankProduct())}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[#0f3d2e] px-4 text-sm font-black text-white"
              >
                <Plus className="h-4 w-4" />
                Add product
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-[#fffaf0] text-xs uppercase tracking-[0.12em] text-[#8b8070]">
                  <tr>
                    <th className="px-5 py-3">Kod</th>
                    <th className="px-5 py-3">Nomi</th>
                    <th className="px-5 py-3">Turi</th>
                    <th className="px-5 py-3">Narx</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-t border-[#eee5d7]">
                      <td className="px-5 py-4 font-black text-[#b1863d]">{product.code}</td>
                      <td className="px-5 py-4">
                        <p className="font-black text-[#1f1b16]">{product.name}</p>
                        <p className="text-xs text-[#8b8070]">{product.material} · {product.size}</p>
                      </td>
                      <td className="px-5 py-4 text-[#51483b]">{product.productType}</td>
                      <td className="px-5 py-4 font-bold text-[#17382d]">{formatTablewarePrice(product.price)}</td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${product.isVisible ? "bg-[#f0f6ec] text-[#28724d]" : "bg-[#f4eee5] text-[#8b8070]"}`}>
                          {product.isVisible ? "Ko'rinadi" : "Yashirilgan"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setProducts((current) =>
                                current.map((item) =>
                                  item.id === product.id ? { ...item, isVisible: !item.isVisible } : item
                                )
                              )
                            }
                            className="grid h-9 w-9 place-items-center rounded-full border border-[#e2d8c9] text-[#17382d]"
                            aria-label="Ko'rinishni almashtirish"
                          >
                            {product.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(product)}
                            className="grid h-9 w-9 place-items-center rounded-full border border-[#e2d8c9] text-[#17382d]"
                            aria-label="Tahrirlash"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setProducts((current) => current.filter((item) => item.id !== product.id))}
                            className="grid h-9 w-9 place-items-center rounded-full border border-[#f0c7bd] text-[#a33a24]"
                            aria-label="O'chirish"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-[#e7decf] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-[#17382d]">{editing ? "Product form" : "Product form"}</h2>
            {editing ? (
              <div className="mt-4 space-y-3">
                {[
                  ["code", "Kod"],
                  ["name", "Nomi"],
                  ["description", "Tavsif"],
                  ["material", "Material"],
                  ["size", "O'lcham"],
                  ["style", "Uslub"],
                ].map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="text-xs font-bold text-[#766b5b]">{label}</span>
                    <input
                      value={String(editing[key as keyof Product] ?? "")}
                      onChange={(event) => setEditing({ ...editing, [key]: event.target.value })}
                      className="mt-1 h-10 w-full rounded-xl border border-[#ded4c3] bg-[#fffdf8] px-3 text-sm outline-none focus:border-[#0f3d2e]"
                    />
                  </label>
                ))}
                <label className="block">
                  <span className="text-xs font-bold text-[#766b5b]">Narx</span>
                  <input
                    type="number"
                    value={editing.price}
                    onChange={(event) => setEditing({ ...editing, price: Number(event.target.value) })}
                    className="mt-1 h-10 w-full rounded-xl border border-[#ded4c3] bg-[#fffdf8] px-3 text-sm outline-none focus:border-[#0f3d2e]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-[#766b5b]">Mahsulot turi</span>
                  <select
                    value={editing.productType}
                    onChange={(event) => setEditing({ ...editing, productType: event.target.value })}
                    className="mt-1 h-10 w-full rounded-xl border border-[#ded4c3] bg-[#fffdf8] px-3 text-sm outline-none focus:border-[#0f3d2e]"
                  >
                    {productTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-[#766b5b]">Mos joy</span>
                  <select
                    value={editing.restaurantTypes[0] ?? "Restoran"}
                    onChange={(event) => setEditing({ ...editing, restaurantTypes: [event.target.value] })}
                    className="mt-1 h-10 w-full rounded-xl border border-[#ded4c3] bg-[#fffdf8] px-3 text-sm outline-none focus:border-[#0f3d2e]"
                  >
                    {restaurantTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={saveProduct}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0f3d2e] text-sm font-black text-white"
                >
                  <Save className="h-4 w-4" />
                  Saqlash
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#766b5b]">Mahsulotni tahrirlash yoki yangisini qo'shish uchun tugmani bosing.</p>
            )}
          </div>

          <div className="rounded-3xl border border-[#e7decf] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-[#17382d]">Ready sets</h2>
            <div className="mt-4 space-y-3">
              {readySets.slice(0, 6).map((set) => (
                <div key={set.id} className="rounded-2xl bg-[#fffaf0] p-3">
                  <p className="font-black text-[#1f1b16]">{set.name}</p>
                  <p className="text-xs text-[#766b5b]">{set.items.length} turdagi mahsulot · {set.recommendedSeats} o'rin</p>
                </div>
              ))}
            </div>
            <button type="button" className="mt-4 h-10 w-full rounded-full border border-[#d9cebb] text-sm font-black text-[#17382d]">
              Add/edit ready set
            </button>
          </div>

          <div className="rounded-3xl border border-dashed border-[#d9cebb] bg-[#fffaf0] p-5">
            <h2 className="text-xl font-black text-[#17382d]">Submitted requests</h2>
            <p className="mt-2 text-sm text-[#766b5b]">Bu joy keyingi versiyada Telegram/WhatsApp so'rovlarini ko'rish uchun ulanadi.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
