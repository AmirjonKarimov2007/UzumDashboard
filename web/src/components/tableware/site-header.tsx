import Link from "next/link";
import { ArrowRight, ChefHat } from "lucide-react";
import { siteNav } from "@/lib/tableware-config";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#e8e1d3] bg-[#fffdf8]/92 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0f3d2e] text-white shadow-sm">
            <ChefHat className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-extrabold tracking-[-0.02em] text-[#17382d]">Idish Set</span>
            <span className="block text-xs text-[#766b5b]">Restoran ta'minoti</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {siteNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm font-semibold text-[#51483b] transition hover:bg-[#f2eadc] hover:text-[#17382d]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/builder"
          className="inline-flex items-center gap-2 rounded-full bg-[#0f3d2e] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#08291f]"
        >
          Set yig'ish
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
