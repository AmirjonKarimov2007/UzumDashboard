export type Availability = "Mavjud" | "Buyurtma asosida";
export type BudgetSegment = "Ekonom" | "Standart" | "Premium" | "VIP";

export interface Product {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  category: string;
  productType: string;
  restaurantTypes: string[];
  foodTypes: string[];
  material: string;
  size: string;
  volume?: string;
  color: string;
  style: string;
  budgetSegment: BudgetSegment;
  packageQuantity: number;
  availability: Availability;
  stockQuantity: number;
  isFeatured: boolean;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReadySetItem {
  productId: string;
  quantity: number;
}

export interface ReadySet {
  id: string;
  slug: string;
  name: string;
  description: string;
  restaurantType: string;
  recommendedSeats: number;
  budgetSegment: BudgetSegment;
  items: ReadySetItem[];
  isFeatured: boolean;
  isVisible: boolean;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface CartLine extends CartItem {
  product: Product;
  subtotal: number;
}

export interface FilterState {
  search: string;
  restaurantTypes: string[];
  productTypes: string[];
  foodTypes: string[];
  materials: string[];
  sizes: string[];
  styles: string[];
  budgetSegments: string[];
  availability: string[];
}

export interface SeatRecommendation {
  restaurantType: string;
  seats: number;
  title: string;
  items: ReadySetItem[];
}
