import type { FilterState, Product } from "@/lib/tableware-types";

export const emptyFilters: FilterState = {
  search: "",
  restaurantTypes: [],
  productTypes: [],
  foodTypes: [],
  materials: [],
  sizes: [],
  styles: [],
  budgetSegments: [],
  availability: [],
};

function includesAny(productValues: string[], selected: string[]) {
  return selected.length === 0 || selected.some((value) => productValues.includes(value));
}

function equalsSelected(value: string, selected: string[]) {
  return selected.length === 0 || selected.includes(value);
}

export function filterProducts(products: Product[], filters: FilterState) {
  const query = filters.search.trim().toLowerCase();

  return products.filter((product) => {
    if (!product.isVisible) return false;

    const searchable = [
      product.name,
      product.code,
      product.material,
      product.category,
      product.productType,
      product.size,
      product.style,
      product.budgetSegment,
      ...product.foodTypes,
      ...product.restaurantTypes,
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!query || searchable.includes(query)) &&
      includesAny(product.restaurantTypes, filters.restaurantTypes) &&
      equalsSelected(product.productType, filters.productTypes) &&
      includesAny(product.foodTypes, filters.foodTypes) &&
      equalsSelected(product.material, filters.materials) &&
      equalsSelected(product.size, filters.sizes) &&
      equalsSelected(product.style, filters.styles) &&
      equalsSelected(product.budgetSegment, filters.budgetSegments) &&
      equalsSelected(product.availability, filters.availability)
    );
  });
}

export function toggleFilterValue(filters: FilterState, key: keyof FilterState, value: string): FilterState {
  if (key === "search") return { ...filters, search: value };
  const current = filters[key] as string[];
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  return { ...filters, [key]: next };
}
