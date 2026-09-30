"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import {
  availabilityOptions,
  budgetSegments,
  foodTypes,
  materials,
  productTypes,
  restaurantTypes,
  sizes,
  styles,
} from "@/lib/tableware-config";
import type { FilterState } from "@/lib/tableware-types";

interface FilterPanelProps {
  filters: FilterState;
  onSearch: (value: string) => void;
  onToggle: (key: keyof FilterState, value: string) => void;
  onClear: () => void;
  activeFilterCount: number;
}

const groups: Array<{ title: string; key: keyof FilterState; values: string[] }> = [
  { title: "Joy turi", key: "restaurantTypes", values: restaurantTypes },
  { title: "Mahsulot turi", key: "productTypes", values: productTypes },
  { title: "Taom turi", key: "foodTypes", values: foodTypes },
  { title: "Material", key: "materials", values: materials },
  { title: "O'lcham", key: "sizes", values: sizes },
  { title: "Uslub", key: "styles", values: styles },
  { title: "Byudjet", key: "budgetSegments", values: budgetSegments },
  { title: "Mavjudlik", key: "availability", values: availabilityOptions },
];

export function FilterPanel({ filters, onSearch, onToggle, onClear, activeFilterCount }: FilterPanelProps) {
  return (
    <aside className="rounded-2xl border border-[#e7decf] bg-white p-4 shadow-[0_18px_55px_rgba(45,35,20,0.07)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-[#0f3d2e]" />
          <h2 className="text-lg font-black text-[#1f1b16]">Filterlar</h2>
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-full bg-[#fff3df] px-3 py-1 text-xs font-bold text-[#8b5a1f]"
          >
            <X className="h-3.5 w-3.5" />
            Tozalash
          </button>
        )}
      </div>
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b8070]" />
        <input
          value={filters.search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Nomi, kodi, materiali..."
          className="h-11 w-full rounded-xl border border-[#ded4c3] bg-[#fffdf8] pl-10 pr-3 text-sm text-[#1f1b16] outline-none transition focus:border-[#0f3d2e] focus:ring-2 focus:ring-[#0f3d2e]/15"
        />
      </label>
      <div className="mt-5 max-h-[calc(100vh-210px)] space-y-5 overflow-auto pr-1">
        {groups.map((group) => {
          const selected = filters[group.key] as string[];
          return (
            <section key={group.key} className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-[0.16em] text-[#8b8070]">{group.title}</h3>
              <div className="flex flex-wrap gap-2">
                {group.values.map((value) => {
                  const active = selected.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onToggle(group.key, value)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                        active
                          ? "border-[#0f3d2e] bg-[#0f3d2e] text-white"
                          : "border-[#e2d8c9] bg-[#fffdf8] text-[#5f5548] hover:border-[#0f3d2e]"
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
