"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { products } from "@/data/products";
import { getSeatRecommendation, recommendationOptions } from "@/data/recommendations";
import { useCart } from "@/hooks/useCart";

export function RecommendationBuilder() {
  const cart = useCart();
  const [seats, setSeats] = useState(50);
  const [restaurantType, setRestaurantType] = useState("Choyxona");
  const recommendation = useMemo(() => getSeatRecommendation(restaurantType, seats), [restaurantType, seats]);

  return (
    <section className="rounded-3xl border border-[#e7decf] bg-[#fffdf8] p-5 shadow-[0_18px_55px_rgba(45,35,20,0.07)]">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#0f3d2e] text-white">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b1863d]">Tavsiya</p>
          <h2 className="text-xl font-black text-[#1f1b16]">Nechta kishilik joy uchun kerak?</h2>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-bold text-[#51483b]">Joy turi</p>
          <div className="flex flex-wrap gap-2">
            {recommendationOptions.restaurantTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setRestaurantType(type)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                  restaurantType === type
                    ? "border-[#0f3d2e] bg-[#0f3d2e] text-white"
                    : "border-[#e2d8c9] bg-white text-[#5f5548]"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold text-[#51483b]">O'rin soni</p>
          <div className="flex flex-wrap gap-2">
            {recommendationOptions.seats.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSeats(value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                  seats === value
                    ? "border-[#0f3d2e] bg-[#0f3d2e] text-white"
                    : "border-[#e2d8c9] bg-white text-[#5f5548]"
                }`}
              >
                {value} kishilik
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {recommendation.items.map((item) => {
          const product = products.find((candidate) => candidate.id === item.productId);
          if (!product) return null;
          return (
            <div key={item.productId} className="rounded-2xl border border-[#eee5d7] bg-white p-3">
              <p className="text-sm font-black text-[#1f1b16]">{product.name}</p>
              <p className="text-xs text-[#766b5b]">{item.quantity} dona</p>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => cart.addItems(recommendation.items)}
        className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-[#0f3d2e] px-5 text-sm font-black text-white transition hover:bg-[#08291f]"
      >
        Tavsiya qilingan setni qo'shish
      </button>
    </section>
  );
}
