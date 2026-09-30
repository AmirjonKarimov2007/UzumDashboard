import type { SeatRecommendation } from "@/lib/tableware-types";

const multiplier = (base: Array<{ productId: string; perSeat: number; minimum?: number }>, seats: number) =>
  base.map((item) => ({
    productId: item.productId,
    quantity: Math.max(item.minimum ?? 0, Math.round(item.perSeat * seats)),
  }));

export const recommendationOptions = {
  seats: [20, 50, 100, 200],
  restaurantTypes: ["Choyxona", "Kafe", "Restoran", "Osh markazi", "Coffee shop", "Banket"],
};

const templates: Record<string, Array<{ productId: string; perSeat: number; minimum?: number }>> = {
  Choyxona: [
    { productId: "prod-003", perSeat: 2 },
    { productId: "prod-002", perSeat: 1 },
    { productId: "prod-019", perSeat: 0.6, minimum: 8 },
    { productId: "prod-009", perSeat: 1 },
    { productId: "prod-005", perSeat: 0.4, minimum: 8 },
    { productId: "prod-004", perSeat: 0.2, minimum: 4 },
    { productId: "prod-016", perSeat: 0.4, minimum: 6 },
  ],
  Kafe: [
    { productId: "prod-001", perSeat: 1.6 },
    { productId: "prod-013", perSeat: 1.6 },
    { productId: "prod-012", perSeat: 1.2 },
    { productId: "prod-010", perSeat: 1.4 },
    { productId: "prod-011", perSeat: 1.2 },
    { productId: "prod-008", perSeat: 0.18, minimum: 4 },
  ],
  Restoran: [
    { productId: "prod-001", perSeat: 1.8 },
    { productId: "prod-014", perSeat: 1 },
    { productId: "prod-018", perSeat: 0.7 },
    { productId: "prod-005", perSeat: 1 },
    { productId: "prod-010", perSeat: 1.5 },
    { productId: "prod-011", perSeat: 1.5 },
  ],
  "Osh markazi": [
    { productId: "prod-003", perSeat: 2 },
    { productId: "prod-002", perSeat: 1 },
    { productId: "prod-019", perSeat: 0.6 },
    { productId: "prod-009", perSeat: 1 },
    { productId: "prod-004", perSeat: 0.2, minimum: 4 },
    { productId: "prod-016", perSeat: 0.4, minimum: 8 },
  ],
  "Coffee shop": [
    { productId: "prod-012", perSeat: 2 },
    { productId: "prod-013", perSeat: 1.4 },
    { productId: "prod-006", perSeat: 1 },
    { productId: "prod-008", perSeat: 0.2, minimum: 4 },
    { productId: "prod-020", perSeat: 0.05, minimum: 1 },
  ],
  Banket: [
    { productId: "prod-001", perSeat: 1.4 },
    { productId: "prod-007", perSeat: 0.25, minimum: 6 },
    { productId: "prod-015", perSeat: 0.3, minimum: 8 },
    { productId: "prod-005", perSeat: 0.8 },
    { productId: "prod-010", perSeat: 1.4 },
    { productId: "prod-011", perSeat: 1.4 },
  ],
};

export function getSeatRecommendation(restaurantType: string, seats: number): SeatRecommendation {
  return {
    restaurantType,
    seats,
    title: `${seats} kishilik ${restaurantType.toLowerCase()} uchun tavsiya`,
    items: multiplier(templates[restaurantType] ?? templates.Choyxona, seats),
  };
}
