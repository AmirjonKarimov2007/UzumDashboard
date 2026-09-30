import { notFound } from "next/navigation";
import { ItemsAddToSet } from "@/components/tableware/add-to-set-button";
import { ProductVisual } from "@/components/tableware/product-visual";
import { SiteHeader } from "@/components/tableware/site-header";
import { getReadySetBySlug, readySets } from "@/data/readySets";
import { buildCartLines, buildRequestMessage, formatTablewarePrice, telegramShareUrl, whatsappShareUrl } from "@/lib/tableware-message";

export function generateStaticParams() {
  return readySets.map((set) => ({ slug: set.slug }));
}

export default async function ReadySetDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const readySet = getReadySetBySlug(slug);
  if (!readySet) notFound();

  const lines = buildCartLines(readySet.items);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalPrice = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const message = buildRequestMessage(lines);

  return (
    <main className="tableware-shell min-h-screen bg-[#fffdf8] text-[#1f1b16]">
      <SiteHeader />
      <section className="border-b border-[#eadfce] bg-[#f7f0e6]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b1863d]">{readySet.restaurantType}</p>
            <h1 className="mt-2 text-4xl font-black text-[#17382d]">{readySet.name}</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-[#6b6254]">{readySet.description}</p>
          </div>
          <div className="rounded-3xl border border-[#e0d4c3] bg-white p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-[#8b8070]">Tavsiya</p>
                <p className="text-xl font-black text-[#17382d]">{readySet.recommendedSeats} o'rin</p>
              </div>
              <div>
                <p className="text-xs text-[#8b8070]">Segment</p>
                <p className="text-xl font-black text-[#17382d]">{readySet.budgetSegment}</p>
              </div>
              <div>
                <p className="text-xs text-[#8b8070]">Jami mahsulot</p>
                <p className="text-xl font-black text-[#17382d]">{totalQuantity} dona</p>
              </div>
              <div>
                <p className="text-xs text-[#8b8070]">Taxminiy summa</p>
                <p className="text-xl font-black text-[#17382d]">{formatTablewarePrice(totalPrice)}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              <ItemsAddToSet items={readySet.items} />
              <a
                href={telegramShareUrl(message)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center justify-center rounded-full bg-[#d7bf7a] px-5 text-sm font-black text-[#17382d]"
              >
                Telegramga yuborish
              </a>
              <a
                href={whatsappShareUrl(message)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center justify-center rounded-full border border-[#d9cebb] px-5 text-sm font-black text-[#17382d]"
              >
                WhatsAppga yuborish
              </a>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-black text-[#17382d]">Set tarkibi</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {lines.map((line) => (
            <article key={line.productId} className="grid gap-4 rounded-3xl border border-[#e7decf] bg-white p-4 shadow-sm sm:grid-cols-[180px_1fr]">
              <ProductVisual imageKey={line.product.images[0]} name={line.product.name} className="min-h-[150px]" />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b1863d]">{line.product.code}</p>
                <h3 className="mt-1 text-xl font-black text-[#1f1b16]">{line.product.name}</h3>
                <p className="mt-2 text-sm text-[#766b5b]">{line.product.description}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-[#5f5548]">
                  <span className="rounded-full bg-[#fffaf0] px-3 py-1">{line.quantity} dona</span>
                  <span className="rounded-full bg-[#fffaf0] px-3 py-1">{line.product.material}</span>
                  <span className="rounded-full bg-[#fffaf0] px-3 py-1">{line.product.size}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
