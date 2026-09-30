import { notFound } from "next/navigation";
import { ProductAddToSet } from "@/components/tableware/add-to-set-button";
import { ProductCard } from "@/components/tableware/product-card";
import { ProductVisual } from "@/components/tableware/product-visual";
import { SiteHeader } from "@/components/tableware/site-header";
import { getProductBySlug, products } from "@/data/products";
import { formatTablewarePrice } from "@/lib/tableware-message";

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const related = products
    .filter((candidate) => candidate.id !== product.id && candidate.productType === product.productType)
    .slice(0, 3);

  return (
    <main className="tableware-shell min-h-screen bg-[#fffdf8] text-[#1f1b16]">
      <SiteHeader />
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
        <div className="space-y-4">
          <ProductVisual imageKey={product.images[0]} name={product.name} className="min-h-[420px]" />
          <div className="grid grid-cols-3 gap-3">
            {product.images.concat(product.images).slice(0, 3).map((image, index) => (
              <ProductVisual key={`${image}-${index}`} imageKey={image} name={product.name} className="min-h-[120px]" />
            ))}
          </div>
        </div>
        <div className="space-y-5">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b1863d]">{product.code}</p>
            <h1 className="mt-2 text-4xl font-black text-[#17382d]">{product.name}</h1>
            <p className="mt-4 text-lg font-black text-[#0f3d2e]">{formatTablewarePrice(product.price)}</p>
            <p className="mt-4 leading-8 text-[#6b6254]">{product.description}</p>
          </div>
          <ProductAddToSet product={product} />
          <div className="rounded-3xl border border-[#e7decf] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-[#17382d]">Mahsulot ma'lumotlari</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                ["Kategoriya", product.category],
                ["Mahsulot turi", product.productType],
                ["Material", product.material],
                ["O'lcham", product.size],
                ["Rang/uslub", `${product.color}, ${product.style}`],
                ["Qadoq", `${product.packageQuantity} dona`],
                ["Mavjudlik", product.availability],
                ["Ombor", `${product.stockQuantity} dona`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-[#fffaf0] p-3">
                  <dt className="text-xs text-[#8b8070]">{label}</dt>
                  <dd className="font-black text-[#1f1b16]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-3xl border border-[#e7decf] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-[#17382d]">Mos keladi</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {[...product.restaurantTypes, ...product.foodTypes].map((item) => (
                <span key={item} className="rounded-full border border-[#e2d8c9] px-3 py-1 text-xs font-bold text-[#5f5548]">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
      {related.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
          <h2 className="mb-5 text-2xl font-black text-[#17382d]">O'xshash mahsulotlar</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
