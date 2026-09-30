import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardList, Filter, MessageCircle, PackageCheck } from "lucide-react";
import { SiteHeader } from "@/components/tableware/site-header";
import { ProductVisual } from "@/components/tableware/product-visual";
import { ReadySetCard } from "@/components/tableware/ready-set-card";
import { products } from "@/data/products";
import { readySets } from "@/data/readySets";
import { productTypes } from "@/lib/tableware-config";


const heroCards = ["Choyxona", "Kafe", "Restoran", "Osh markazi", "Coffee shop", "Banket"];

export default function Home() {
  const featuredProducts = products.filter((product) => product.isFeatured).slice(0, 4);
  const featuredSets = readySets.filter((set) => set.isFeatured).slice(0, 3);

  return (
    <main className="tableware-shell min-h-screen bg-[#fffdf8] text-[#1f1b16]">
      <SiteHeader />
      <section className="overflow-hidden border-b border-[#eadfce] bg-[linear-gradient(135deg,#fffdf8_0%,#f7efe1_58%,#e8f1e9_100%)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-16">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#b1863d]">B2B set builder</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.02] tracking-normal text-[#17382d] sm:text-6xl">
              Restoraningiz uchun idishlarni online tanlang
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#5f5548]">
              Kafe, restoran, choyxona, osh markazi va banketlar uchun pasuda setlarini oson tanlang, set yig'ing va
              menejerga yuboring.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/builder"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0f3d2e] px-6 text-sm font-black text-white shadow-lg shadow-[#0f3d2e]/20 transition hover:bg-[#08291f]"
              >
                Set yig'ishni boshlash
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/sets"
                className="inline-flex h-12 items-center justify-center rounded-full border border-[#d4c7b5] bg-white/70 px-6 text-sm font-black text-[#17382d] transition hover:bg-white"
              >
                Tayyor setlarni ko'rish
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {heroCards.map((type) => (
                <Link
                  key={type}
                  href={`/builder?restaurantType=${encodeURIComponent(type)}`}
                  className="rounded-2xl border border-[#e0d4c3] bg-white/75 p-4 text-sm font-black text-[#17382d] shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
                >
                  {type}
                </Link>
              ))}
            </div>
          </div>
          <div className="relative min-h-[520px]">
            <div className="absolute inset-0 rounded-[2rem] border border-[#e5d7c1] bg-white/60 shadow-[0_28px_90px_rgba(69,49,24,0.16)]" />
            <div className="relative grid h-full grid-cols-2 gap-4 p-4">
              {featuredProducts.map((product, index) => (
                <div key={product.id} className={index === 0 ? "col-span-2" : ""}>
                  <ProductVisual imageKey={product.images[0]} name={product.name} className="h-full min-h-[150px]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b1863d]">Jarayon</p>
            <h2 className="mt-2 text-3xl font-black text-[#17382d]">Qanday ishlaydi</h2>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Yo'nalishni tanlang", ClipboardList],
            ["Filter orqali mahsulotlarni toping", Filter],
            ["Setga qo'shing", PackageCheck],
            ["Menejerga yuboring", MessageCircle],
          ].map(([label, Icon], index) => (
            <div key={String(label)} className="rounded-3xl border border-[#e7decf] bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <span className="text-sm font-black text-[#b1863d]">0{index + 1}</span>
                <Icon className="h-5 w-5 text-[#0f3d2e]" />
              </div>
              <h3 className="text-lg font-black text-[#1f1b16]">{String(label)}</h3>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#f7f0e6] py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b1863d]">Tayyor yechimlar</p>
              <h2 className="mt-2 text-3xl font-black text-[#17382d]">Popular tayyor setlar</h2>
            </div>
            <Link href="/sets" className="hidden text-sm font-black text-[#0f3d2e] sm:block">
              Hammasini ko'rish
            </Link>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {featuredSets.map((set) => (
              <ReadySetCard key={set.id} readySet={set} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b1863d]">Kategoriya</p>
          <h2 className="mt-2 text-3xl font-black text-[#17382d]">Mahsulot kategoriyalari</h2>
          <p className="mt-4 text-[#6b6254]">
            Katalog restoran turi, taom turi, material, o'lcham, uslub va byudjet bo'yicha tanlashga moslangan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {productTypes.map((type) => (
            <Link
              key={type}
              href={`/builder?productType=${encodeURIComponent(type)}`}
              className="rounded-full border border-[#e2d8c9] bg-white px-4 py-2 text-sm font-bold text-[#51483b] hover:border-[#0f3d2e]"
            >
              {type}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] bg-[#17382d] p-6 text-white shadow-[0_25px_90px_rgba(15,61,46,0.25)] lg:p-8">
          <h2 className="text-3xl font-black">Nega aynan biz?</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            {[
              "Restoranlar uchun mos tanlov",
              "Ekonom, standart va premium variantlar",
              "Material va o'lcham bo'yicha filter",
              "Tez buyurtma ro'yxati",
              "Telegram orqali bog'lanish",
            ].map((item) => (
              <div key={item} className="flex gap-3 rounded-2xl bg-white/8 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#d7bf7a]" />
                <p className="text-sm font-bold leading-6">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
