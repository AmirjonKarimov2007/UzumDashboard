import { ReadySetCard } from "@/components/tableware/ready-set-card";
import { SiteHeader } from "@/components/tableware/site-header";
import { readySets } from "@/data/readySets";

export default function SetsPage() {
  return (
    <main className="tableware-shell min-h-screen bg-[#fffdf8] text-[#1f1b16]">
      <SiteHeader />
      <section className="border-b border-[#eadfce] bg-[#f7f0e6]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b1863d]">Tayyor komplektlar</p>
          <h1 className="mt-2 text-4xl font-black text-[#17382d]">Restoran turiga mos tayyor setlar</h1>
          <p className="mt-3 max-w-2xl text-[#6b6254]">
            Osh markazi, choyxona, kafe, coffee shop va banketlar uchun oldindan hisoblangan setlar.
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:px-8">
        {readySets.map((set) => (
          <ReadySetCard key={set.id} readySet={set} />
        ))}
      </section>
    </main>
  );
}
